"""Centralized application state for the Denon Dashboard backend."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import WebSocket

from config import settings
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
        self.source_name_overrides: dict[str, str] = {}
        self.data_dir = Path(os.environ.get("DENON_DASHBOARD_DATA_DIR", "/data"))
        self.source_name_overrides_path = self.data_dir / "source_names.json"
        self.ui_settings_path = self.data_dir / "ui_settings.json"
        self.night_mode_config_path = self.data_dir / "night_mode.json"
        self.radio_favorites_path = self.data_dir / "radio_favorites.json"
        self.ui_settings: dict[str, Any] = {}
        self.night_mode_config: dict[str, Any] = self.default_night_mode_config()
        self.radio_favorites: list[dict[str, Any]] = []
        self.night_mode_auto_active: bool = False
        self.heos_available_services: set[str] = set()  # HEOS service names from receiver
        self.media_state: dict[str, Any] = {"now_playing": None, "play_state": None}
        self.night_mode_enabled: bool = False
        self.night_mode_snapshot: dict[str, int] = {}
        self._lock = asyncio.Lock()
        self._last_broadcast_state: dict[str, Any] = {}

    @asynccontextmanager
    async def locked(self):
        """Public context manager to synchronize state mutations."""
        async with self._lock:
            yield

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
        if code in self.source_name_overrides:
            return self.source_name_overrides[code]
        if code in self.source_name_cache:
            return self.source_name_cache[code]
        discovered = self.discovered_sources
        if code in discovered:
            return discovered[code]
        return DEFAULT_SOURCES.get(code, code)

    def load_source_name_overrides(self) -> None:
        """Load persisted source display name overrides from the data volume."""
        try:
            if not self.source_name_overrides_path.exists():
                self.source_name_overrides = {}
                return
            data = json.loads(self.source_name_overrides_path.read_text())
            if isinstance(data, dict):
                self.source_name_overrides = {
                    str(code): str(name)
                    for code, name in data.items()
                    if isinstance(code, str) and isinstance(name, str) and name.strip()
                }
            else:
                self.source_name_overrides = {}
        except Exception as exc:
            _LOGGER.warning("Failed to load source name overrides: %s", exc)
            self.source_name_overrides = {}

    def save_source_name_overrides(self) -> None:
        """Persist source display name overrides to the data volume."""
        try:
            self.source_name_overrides_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.source_name_overrides_path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self.source_name_overrides, indent=2, sort_keys=True))
            tmp.replace(self.source_name_overrides_path)
        except Exception as exc:
            _LOGGER.error("Failed to save source name overrides: %s", exc)
            raise

    def reset_source_name_override(self, code: str) -> None:
        self.source_name_overrides.pop(code, None)
        self.save_source_name_overrides()

    def set_source_name_override(self, code: str, name: str) -> None:
        self.source_name_overrides[code] = name.strip()
        self.save_source_name_overrides()

    def load_ui_settings(self) -> None:
        """Load persisted UI settings from the data volume."""
        try:
            if not self.ui_settings_path.exists():
                self.ui_settings = {}
                return
            data = json.loads(self.ui_settings_path.read_text())
            self.ui_settings = data if isinstance(data, dict) else {}
        except Exception as exc:
            _LOGGER.warning("Failed to load UI settings: %s", exc)
            self.ui_settings = {}

    def save_ui_settings(self) -> None:
        """Persist UI settings to the data volume."""
        try:
            self.ui_settings_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.ui_settings_path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self.ui_settings, indent=2, sort_keys=True))
            tmp.replace(self.ui_settings_path)
        except Exception as exc:
            _LOGGER.error("Failed to save UI settings: %s", exc)
            raise

    def update_ui_settings(self, updates: dict[str, Any]) -> None:
        for key, value in updates.items():
            if value is None:
                self.ui_settings.pop(key, None)
            else:
                self.ui_settings[key] = value
        self.save_ui_settings()

    def default_night_mode_config(self) -> dict[str, Any]:
        from config import settings
        return {
            "mode": "offset",
            "schedule": {
                "enabled": False,
                "days": [],
                "start": "22:00",
                "end": "02:00",
                "timezone": settings.timezone,
            },
            "channels": [],
        }

    def normalize_night_mode_config(self, data: dict[str, Any] | None) -> dict[str, Any]:
        base = self.default_night_mode_config()
        if not isinstance(data, dict):
            return base
        mode = data.get("mode", "offset")
        if mode not in ("absolute", "offset"):
            mode = "offset"
        schedule = data.get("schedule", {}) if isinstance(data.get("schedule"), dict) else {}
        valid_days = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}
        days = [d for d in schedule.get("days", []) if d in valid_days] if isinstance(schedule.get("days"), list) else []
        channels = data.get("channels", []) if isinstance(data.get("channels", []), list) else []
        return {
            "mode": mode,
            "schedule": {
                "enabled": bool(schedule.get("enabled", False)),
                "days": days,
                "start": schedule.get("start") or "22:00",
                "end": schedule.get("end") or "02:00",
                "timezone": schedule.get("timezone") or base["schedule"].get("timezone", "Europe/Berlin"),
            },
            "channels": channels,
        }

    def load_night_mode_config(self) -> None:
        try:
            if not self.night_mode_config_path.exists():
                self.night_mode_config = self.default_night_mode_config()
                return
            self.night_mode_config = self.normalize_night_mode_config(
                json.loads(self.night_mode_config_path.read_text())
            )
        except Exception as exc:
            _LOGGER.warning("Failed to load night mode config: %s", exc)
            self.night_mode_config = self.default_night_mode_config()

    def save_night_mode_config(self) -> None:
        self.night_mode_config_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.night_mode_config_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.night_mode_config, indent=2, sort_keys=True))
        tmp.replace(self.night_mode_config_path)

    def set_night_mode_config(self, config: dict[str, Any]) -> None:
        self.night_mode_config = self.normalize_night_mode_config(config)
        self.save_night_mode_config()

    def load_radio_favorites(self) -> None:
        try:
            if not self.radio_favorites_path.exists():
                self.radio_favorites = []
                return
            data = json.loads(self.radio_favorites_path.read_text())
            self.radio_favorites = data if isinstance(data, list) else []
        except Exception as exc:
            _LOGGER.warning("Failed to load radio favorites: %s", exc)
            self.radio_favorites = []

    def save_radio_favorites(self) -> None:
        self.radio_favorites_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.radio_favorites_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.radio_favorites, indent=2, sort_keys=True))
        tmp.replace(self.radio_favorites_path)

    def upsert_radio_favorite(self, favorite: dict[str, Any]) -> None:
        self.radio_favorites = [f for f in self.radio_favorites if f.get("mid") != favorite.get("mid")]
        self.radio_favorites.insert(0, favorite)
        self.save_radio_favorites()

    def remove_radio_favorite(self, mid: str) -> None:
        self.radio_favorites = [f for f in self.radio_favorites if f.get("mid") != mid]
        self.save_radio_favorites()

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
            "night_mode_enabled": self.night_mode_enabled,
            "night_mode_snapshot": self.night_mode_snapshot,
            "eco_mode": state.get("eco_mode"),
            "z2_power": state.get("z2_power"),
            "z2_volume": state.get("z2_volume"),
            "z2_muted": state.get("z2_muted"),
            "z2_sleep_timer": state.get("z2_sleep_timer"),
            "z2_source": z2src,
            "z2_source_name": self.resolve_source_name(z2src),
            "now_playing": self.media_state.get("now_playing"),
            "play_state": self.media_state.get("play_state"),
            "stream_quality": self._detect_stream_quality(),
        }

    async def broadcast_state(self, force: bool = False) -> None:
        """Broadcast current state to all connected WebSocket clients."""
        data = self.build_status()
        if not force and data == self._last_broadcast_state:
            return
        self._last_broadcast_state = data
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

    async def _on_heos_event(self, event: dict[str, Any]) -> None:
        """Handle unsolicited HEOS events to update media state."""
        heos = event.get("heos", {})
        cmd = heos.get("command", "")
        changed = False

        if cmd == "player/state_changed":
            msg = heos.get("message", "")
            for part in msg.split("&"):
                if part.startswith("state="):
                    self.media_state["play_state"] = part[6:]
                    changed = True
        elif cmd == "player/now_playing_changed":
            if self.heos and self.heos.connected:
                # Fetch the full now_playing payload
                now_playing = await self.heos.get_now_playing()
                self.media_state["now_playing"] = now_playing
                changed = True

        if changed:
            await self.broadcast_state()

    async def connect_to_host(self, host: str) -> None:
        """Connect telnet + HEOS for a given host IP."""
        from calibration import fetch_speaker_calibration

        async with self.locked():
            self.speaker_calibration = await fetch_speaker_calibration(host)

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
            heos_client.on_event(self._on_heos_event)
            
            try:
                await heos_client.connect()
            except Exception as exc:
                _LOGGER.warning("HEOS connection failed: %s", exc)

            # Assign atomically so API never sees half-initialized state
            self.telnet = telnet_client
            self.heos = heos_client

            # Discover available HEOS music services and initial media state
            if heos_client.connected:
                try:
                    sources = await heos_client.get_music_sources()
                    self.heos_available_services = {s["name"] for s in sources}
                    _LOGGER.info("HEOS music services: %s", self.heos_available_services)
                    
                    # Initial state fetch
                    self.media_state["now_playing"] = await heos_client.get_now_playing()
                    self.media_state["play_state"] = await heos_client.get_play_state()
                except Exception as exc:
                    _LOGGER.warning("Failed to fetch initial HEOS state: %s", exc)

        # Notify all connected WebSocket clients that state changed
        await self.broadcast_state()


# Singleton instance — imported by main.py and all route modules
app_state = AppState()
