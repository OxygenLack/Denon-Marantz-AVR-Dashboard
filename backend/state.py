"""Centralized application state for the Denon Dashboard backend."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from fastapi import WebSocket

from config import settings
from androidtv.adb_client import AndroidTvAdbClient
from androidtv.remote_client import AndroidTvRemoteClient
from denon.const import CHANNEL_NAMES, DEFAULT_SOURCES
from denon.heos_client import HeosClient
from denon.telnet_client import DenonTelnetClient

_LOGGER = logging.getLogger(__name__)


class AppState:
    """Encapsulates all mutable application state with proper synchronization."""

    def __init__(self) -> None:
        self.telnet: DenonTelnetClient | None = None
        self.heos: HeosClient | None = None
        self.ws_clients: set[WebSocket] = set()
        self.discovering: bool = False
        self.speaker_calibration: dict[str, float] = {}
        self.source_name_cache: dict[str, str] = {}
        self.heos_available_services: set[str] = set()  # HEOS service names from receiver
        self.media_state: dict[str, Any] = {"now_playing": None, "play_state": None}
        self._media_poll_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self.theme_config: dict = {"base": "gold", "overrides": {}}
        self.android_tv = AndroidTvRemoteClient(
            client_name=settings.android_tv_client_name,
            storage_dir=settings.android_tv_storage_dir,
            notify=self.broadcast_state,
        )
        self.android_adb = AndroidTvAdbClient(
            enabled=settings.android_tv_adb_enabled,
            adb_path=settings.android_tv_adb_path,
            storage_dir=settings.android_tv_adb_storage_dir,
            default_port=settings.android_tv_adb_port,
        )

    @property
    def discovered_sources(self) -> dict[str, str]:
        """Source names discovered from the receiver via SSFUN."""
        if self.telnet:
            return self.telnet.state.get("source_names", {})
        return {}

    # HEOS source ID → (telnet source code, display name)
    # sid comes from now_playing.sid; source code maps to the button in the UI
    _HEOS_SID_MAP: dict[int, tuple[str, str]] = {
        4:    ("SPOTIFY",   "Spotify"),        # Spotify Connect
        3:    ("IRADIO",    "TuneIn"),         # TuneIn
        5:    ("NET",       "Deezer"),         # Deezer (no dedicated button)
        9:    ("NET",       "SoundCloud"),     # SoundCloud
        10:   ("NET",       "Tidal"),          # Tidal
        13:   ("NET",       "Amazon Music"),   # Amazon Music
        30:   ("NET",       "Qobuz"),          # Qobuz
        1024: ("SERVER",    "Local Music"),    # DLNA/UPnP server
        1025: ("NET",       "Playlists"),      # HEOS Playlists
        1026: ("NET",       "History"),        # HEOS History
        1028: ("FAVORITES", "Favorites"),      # HEOS Favorites
    }

    # Fallback: media ID (exact or prefix) → (telnet source code, display name)
    _HEOS_MID_PREFIXES: list[tuple[str, str, str]] = [
        ("spotify:",      "SPOTIFY",   "Spotify"),
        ("tidal:",        "NET",       "Tidal"),
        ("amazon_music:", "NET",       "Amazon Music"),
        ("deezer:",       "NET",       "Deezer"),
        ("pandora:",      "PANDORA",   "Pandora"),
        ("siriusxm:",     "SIRIUSXM",  "SiriusXM"),
        ("soundcloud:",   "NET",       "SoundCloud"),
        ("tunein:",       "IRADIO",    "TuneIn"),
        ("iheartradio:",  "IRADIO",    "iHeartRadio"),
        ("Bluetooth",     "BT",        "Bluetooth"),
    ]

    def resolve_source_name(self, code: str | None) -> str | None:
        """Resolve a source protocol code to a display name.

        Priority: env config > receiver-discovered > built-in defaults > raw code.
        """
        if not code:
            return None
        if code in self.source_name_cache:
            return self.source_name_cache[code]
        discovered = self.discovered_sources
        if code in discovered:
            return discovered[code]
        return DEFAULT_SOURCES.get(code, code)

    def _resolve_heos_service(self) -> tuple[str, str] | None:
        """Detect active HEOS streaming service from now_playing data.

        Returns (source_code, display_name) or None.
        Checks mid (media ID) first — more specific than sid for shared IDs
        like sid=1024 which covers both Local Music and Bluetooth.
        """
        np = self.media_state.get("now_playing")
        if not np:
            return None
        # Check mid first — most specific identifier
        mid = np.get("mid", "")
        if mid:
            for prefix, code, name in self._HEOS_MID_PREFIXES:
                if mid.startswith(prefix):
                    return (code, name)
        # Fall back to sid
        sid = np.get("sid")
        if isinstance(sid, int) and sid in self._HEOS_SID_MAP:
            return self._HEOS_SID_MAP[sid]
        return None

    _BITRATE_RE = re.compile(r'[_/-](\d{2,3})(?:k(?:bps)?)?(?:[/.]|$)', re.I)

    def _detect_stream_quality(self) -> str | None:
        """Best-effort codec/bitrate detection from now_playing mid (stream URL)."""
        np = self.media_state.get("now_playing")
        if not np:
            return None
        mid = np.get("mid", "")
        if not mid:
            return None
        if mid.startswith("spotify:"):
            return "Spotify Connect"
        if mid == "Bluetooth":
            return "Bluetooth"
        parts = []
        ml = mid.lower()
        if "/aacp" in ml or "/aac+" in ml or "he-aac" in ml:
            parts.append("AAC+")
        elif "/aac" in ml or ml.endswith(".aac"):
            parts.append("AAC")
        elif "/mp3" in ml or ml.endswith(".mp3"):
            parts.append("MP3")
        elif "/flac" in ml or ml.endswith(".flac"):
            parts.append("FLAC")
        elif "/ogg" in ml or "/vorbis" in ml:
            parts.append("OGG")
        elif "/wma" in ml:
            parts.append("WMA")
        elif ".m3u8" in ml or "/hls" in ml:
            parts.append("HLS")
        m = self._BITRATE_RE.search(mid)
        if m:
            parts.append(f"{m.group(1)} kbps")
        return " ".join(parts) if parts else None

    def build_status(self) -> dict[str, Any]:
        """Build status dict from raw telnet state."""
        state = self.telnet.state if self.telnet else {}
        src = state.get("source")
        z2src = state.get("z2_source")
        # When source is NET, identify the actual streaming service
        source_name = self.resolve_source_name(src)
        heos_source = None
        if src == "NET":
            heos = self._resolve_heos_service()
            if heos:
                heos_source = heos[0]   # source code for button highlight
                source_name = heos[1]   # display name
        return {
            "connected": self.telnet.connected if self.telnet else False,
            "discovering": self.discovering,
            "power": state.get("power"),
            "volume": state.get("volume"),
            "volume_max": state.get("volume_max"),
            "muted": state.get("muted"),
            "source": src,
            "source_name": source_name,
            "heos_source": heos_source,
            "surround_mode": state.get("surround_mode"),
            "surround_mode_list": state.get("surround_mode_list", []),
            "sound_decoder": state.get("sound_decoder"),
            "channel_volumes": state.get("channel_volumes", {}),
            "speaker_calibration": self.speaker_calibration,
            "tone_control": state.get("tone_control"),
            "bass": state.get("bass"),
            "treble": state.get("treble"),
            "subwoofer_level": state.get("subwoofer_level"),
            "subwoofer2_level": state.get("subwoofer2_level"),
            "dialog_level": state.get("dialog_level"),
            "dialog_level_enabled": state.get("dialog_level_enabled"),
            "multeq": state.get("multeq"),
            "dynamic_eq": state.get("dynamic_eq"),
            "dynamic_volume": state.get("dynamic_volume"),
            "ref_level_offset": state.get("ref_level_offset"),
            "sleep_timer": state.get("sleep_timer"),
            "eco_mode": state.get("eco_mode"),
            "z2_power": state.get("z2_power"),
            "z2_volume": state.get("z2_volume"),
            "z2_muted": state.get("z2_muted"),
            "z2_source": z2src,
            "z2_source_name": self.resolve_source_name(z2src),
            "now_playing": self.media_state.get("now_playing"),
            "play_state": self.media_state.get("play_state"),
            "stream_quality": self._detect_stream_quality(),
            "theme_config": self.theme_config,
            "android_tv": self.android_tv.build_status(),
            "android_adb": self.android_adb.build_status(),
        }

    async def broadcast_state(self) -> None:
        """Broadcast current state to all connected WebSocket clients."""
        data = self.build_status()
        msg = json.dumps(data)
        dead: set[WebSocket] = set()
        for ws in list(self.ws_clients):  # copy to avoid mutation during iteration
            try:
                await asyncio.wait_for(ws.send_text(msg), timeout=5.0)
            except Exception:
                dead.add(ws)
        if dead:
            self.ws_clients.difference_update(dead)

    async def send(self, cmd: str) -> bool:
        """Send a telnet command, raise if not connected."""
        if not self.telnet:
            return False
        return await self.telnet.send(cmd)

    async def _poll_media(self) -> None:
        """Background task: poll HEOS for now-playing every 5s, broadcast on change."""
        while True:
            try:
                await asyncio.sleep(5)
                if not self.heos or not self.heos.connected:
                    continue
                now_playing = await self.heos.get_now_playing()
                play_state = await self.heos.get_play_state()
                new_state = {"now_playing": now_playing, "play_state": play_state}
                if new_state != self.media_state:
                    self.media_state = new_state
                    await self.broadcast_state()
            except asyncio.CancelledError:
                return
            except Exception as exc:
                _LOGGER.debug("Media poll error: %s", exc)

    async def start_demo(self) -> None:
        """Set up a mock receiver for development without a physical AVR."""
        from denon.mock_client import MockDenonClient

        async with self._lock:
            mock = MockDenonClient()
            self.telnet = mock  # assign before connect so broadcast_state() works

            async def _on_state_change(state: dict[str, Any]) -> None:
                await self.broadcast_state()

            mock.on_state_change(_on_state_change)
            await mock.connect()

        await self.broadcast_state()

    async def connect_to_host(self, host: str) -> None:
        """Connect telnet + HEOS for a given host IP."""
        from calibration import fetch_speaker_calibration

        async with self._lock:
            self.speaker_calibration = await fetch_speaker_calibration(host)

            # Stop previous media poller
            if self._media_poll_task:
                self._media_poll_task.cancel()
                self._media_poll_task = None

            if self.telnet:
                await self.telnet.disconnect()
            if self.heos:
                await self.heos.disconnect()

            telnet_client = DenonTelnetClient(host, settings.denon_telnet_port)

            async def _on_state_change(state: dict[str, Any]) -> None:
                await self.broadcast_state()

            telnet_client.on_state_change(_on_state_change)

            try:
                await telnet_client.connect()
                _LOGGER.info("Telnet connected to %s:%s", host, settings.denon_telnet_port)
            except Exception as exc:
                _LOGGER.error(
                    "Initial telnet connection failed: %s (will retry in background)", exc
                )

            heos_client = HeosClient(host, settings.denon_heos_port)
            try:
                await heos_client.connect()
            except Exception as exc:
                _LOGGER.warning("HEOS connection failed: %s", exc)

            # Assign atomically so API never sees half-initialized state
            self.telnet = telnet_client
            self.heos = heos_client

            # Discover available HEOS music services and start media poller
            if heos_client.connected:
                try:
                    sources = await heos_client.get_music_sources()
                    self.heos_available_services = {s["name"] for s in sources}
                    _LOGGER.info("HEOS music services: %s", self.heos_available_services)
                except Exception as exc:
                    _LOGGER.warning("Failed to fetch HEOS music sources: %s", exc)
                self._media_poll_task = asyncio.create_task(self._poll_media())

        # Notify all connected WebSocket clients that state changed
        await self.broadcast_state()


# Singleton instance — imported by main.py and all route modules
app_state = AppState()
