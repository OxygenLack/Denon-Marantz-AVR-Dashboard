"""Centralized application state for the Denon Dashboard backend."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import WebSocket

from config import settings
from denon.const import DEFAULT_SOURCES
from denon.heos_client import HeosClient
from denon.heos_media import detect_stream_quality, resolve_heos_service
from denon.heos_message import parse_heos_message
from denon.telnet_client import DenonTelnetClient
from night_mode_config import default_night_mode_config, normalize_night_mode_config
from persistence import JsonStore

_LOGGER = logging.getLogger(__name__)

# Per-client send timeout for a state broadcast. A client that cannot take a
# frame within this is dropped rather than allowed to hold up the others.
WS_SEND_TIMEOUT = 2.0


class AppState:
    """Encapsulates all mutable application state with proper synchronization."""

    def __init__(self) -> None:
        self.telnet: DenonTelnetClient | None = None
        self.heos: HeosClient | None = None
        self.ws_clients: set[WebSocket] = set()
        self.discovering: bool = False
        self.receiver_host: str | None = None
        self.speaker_calibration: dict[str, float] = {}
        self.source_name_cache: dict[str, str] = {}
        self.source_name_overrides: dict[str, str] = {}
        self.data_dir = Path(settings.data_dir)
        self.source_name_overrides_path = self.data_dir / "source_names.json"
        self.ui_settings_path = self.data_dir / "ui_settings.json"
        self.night_mode_config_path = self.data_dir / "night_mode.json"
        self.radio_favorites_path = self.data_dir / "radio_favorites.json"
        self.ui_settings: dict[str, Any] = {}
        self.night_mode_config: dict[str, Any] = default_night_mode_config()
        self.radio_favorites: list[dict[str, Any]] = []
        self.night_mode_auto_active: bool = False
        self.heos_available_services: set[str] = set()  # HEOS service names from receiver
        self.media_state: dict[str, Any] = {"now_playing": None, "play_state": None}
        self.night_mode_enabled: bool = False
        self.night_mode_snapshot: dict[str, int] = {}
        # `_lock` guards short state swaps only; it is never held across network
        # I/O. `_connect_lock` serialises whole (re)connects, which take up to
        # ~25 s against an unreachable receiver.
        self._lock = asyncio.Lock()
        self._connect_lock = asyncio.Lock()
        self._broadcast_lock = asyncio.Lock()
        self._last_broadcast_json: str | None = None

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

    def resolve_source_name(self, code: str | None) -> str | None:
        """Resolve a source protocol code to a display name.

        Priority: persisted UI rename > env config > receiver-discovered >
        built-in defaults > raw code.
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

    # -- persistence (JsonStore: atomic write, tolerant load) --
    # The *_path attributes are read at call time so tests can redirect them.

    def _overrides_store(self) -> JsonStore[dict[str, str]]:
        def validate(data: Any) -> dict[str, str] | None:
            if not isinstance(data, dict):
                return None
            return {
                str(code): str(name)
                for code, name in data.items()
                if isinstance(code, str) and isinstance(name, str) and name.strip()
            }
        return JsonStore(self.source_name_overrides_path, dict, validate, "source name overrides")

    def _ui_settings_store(self) -> JsonStore[dict[str, Any]]:
        return JsonStore(
            self.ui_settings_path, dict,
            lambda d: d if isinstance(d, dict) else None, "UI settings",
        )

    def _night_mode_store(self) -> JsonStore[dict[str, Any]]:
        return JsonStore(
            self.night_mode_config_path, default_night_mode_config,
            normalize_night_mode_config, "night mode config",
        )

    def _radio_favorites_store(self) -> JsonStore[list[dict[str, Any]]]:
        def validate(data: Any) -> list[dict[str, Any]] | None:
            if not isinstance(data, list):
                return None
            # Drop entries /device could not serialise (mid and name required).
            return [
                f for f in data
                if isinstance(f, dict)
                and isinstance(f.get("mid"), str) and f["mid"]
                and isinstance(f.get("name"), str) and f["name"]
            ]
        return JsonStore(self.radio_favorites_path, list, validate, "radio favorites")

    def load_source_name_overrides(self) -> None:
        """Load persisted source display name overrides from the data volume."""
        self.source_name_overrides = self._overrides_store().load()

    def save_source_name_overrides(self) -> None:
        """Persist source display name overrides to the data volume."""
        self._overrides_store().save(self.source_name_overrides)

    def reset_source_name_override(self, code: str) -> None:
        self.source_name_overrides.pop(code, None)
        self.save_source_name_overrides()

    def set_source_name_override(self, code: str, name: str) -> None:
        self.source_name_overrides[code] = name.strip()
        self.save_source_name_overrides()

    def load_ui_settings(self) -> None:
        """Load persisted UI settings from the data volume."""
        self.ui_settings = self._ui_settings_store().load()

    def save_ui_settings(self) -> None:
        """Persist UI settings to the data volume."""
        self._ui_settings_store().save(self.ui_settings)

    def update_ui_settings(self, updates: dict[str, Any]) -> None:
        for key, value in updates.items():
            if value is None:
                self.ui_settings.pop(key, None)
            else:
                self.ui_settings[key] = value
        self.save_ui_settings()

    def load_night_mode_config(self) -> None:
        self.night_mode_config = self._night_mode_store().load()

    def save_night_mode_config(self) -> None:
        self._night_mode_store().save(self.night_mode_config)

    def set_night_mode_config(self, config: dict[str, Any]) -> None:
        self.night_mode_config = normalize_night_mode_config(config)
        self.save_night_mode_config()

    def load_radio_favorites(self) -> None:
        self.radio_favorites = self._radio_favorites_store().load()

    def save_radio_favorites(self) -> None:
        self._radio_favorites_store().save(self.radio_favorites)

    def upsert_radio_favorite(self, favorite: dict[str, Any]) -> None:
        self.radio_favorites = [f for f in self.radio_favorites if f.get("mid") != favorite.get("mid")]
        self.radio_favorites.insert(0, favorite)
        self.save_radio_favorites()

    def remove_radio_favorite(self, mid: str) -> None:
        self.radio_favorites = [f for f in self.radio_favorites if f.get("mid") != mid]
        self.save_radio_favorites()

    def build_status(self) -> dict[str, Any]:
        """Build status dict from raw telnet state."""
        state = self.telnet.state if self.telnet else {}
        src = state.get("source")
        z2src = state.get("z2_source")
        # When source is NET, identify the actual streaming service
        source_name = self.resolve_source_name(src)
        heos_source = None
        if src == "NET":
            heos = resolve_heos_service(self.media_state.get("now_playing"))
            if heos:
                heos_source = heos[0]   # source code for button highlight
                source_name = heos[1]   # display name
        return {
            "connected": self.telnet.connected if self.telnet else False,
            # Demo mode simulates Now Playing, so it must never read as offline.
            "heos_connected": True if settings.demo_mode else bool(self.heos and self.heos.connected),
            "discovering": self.discovering,
            "theme": self.ui_settings.get("theme") or settings.theme,
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
            "stream_quality": detect_stream_quality(self.media_state.get("now_playing")),
        }

    async def broadcast_state(self, force: bool = False) -> None:
        """Broadcast current state to all connected WebSocket clients.

        Serialized by `_broadcast_lock` with the snapshot built inside it, so a
        newer snapshot is never overtaken by an older one. Sends go out to all
        clients concurrently with a per-client timeout; a client that fails or
        times out is dropped.

        The dedupe compares the serialised JSON frame, not the dict: the
        snapshot shares nested dicts (``channel_volumes``) with the telnet
        state, so an in-place mutation made a dict comparison always equal and
        a lone ``CV`` change was never sent.
        """
        async with self._broadcast_lock:
            msg = json.dumps(self.build_status())
            if not force and msg == self._last_broadcast_json:
                return
            self._last_broadcast_json = msg
            clients = list(self.ws_clients)
            if not clients:
                return
            results = await asyncio.gather(
                *(asyncio.wait_for(ws.send_text(msg), WS_SEND_TIMEOUT) for ws in clients),
                return_exceptions=True,
            )
            dead: set[WebSocket] = set()
            for ws, result in zip(clients, results, strict=True):
                if isinstance(result, BaseException):
                    if isinstance(result, TimeoutError):
                        _LOGGER.debug(
                            "WebSocket client send timed out (%ss), dropping client",
                            WS_SEND_TIMEOUT,
                        )
                    dead.add(ws)
            if dead:
                self.ws_clients.difference_update(dead)

    async def _broadcast_on_change(self, _state: dict[str, Any]) -> None:
        """Telnet state-change callback: push the new snapshot to all clients."""
        await self.broadcast_state()

    async def start_demo(self) -> None:
        """Set up a mock receiver for development without a physical AVR.

        Used when DENON_DASHBOARD_DEMO_MODE=true. Installs a MockDenonClient as
        the telnet client; no HEOS client is created (media state stays the empty
        default), and no real network connection is attempted.
        """
        from denon.mock_client import (
            DEMO_MEDIA_STATE,
            DEMO_SPEAKER_CALIBRATION,
            MockDenonClient,
        )

        async with self.locked():
            mock = MockDenonClient()
            self.telnet = mock  # assign before connect so build_status() works
            mock.on_state_change(self._broadcast_on_change)
            await mock.connect()

            # Fake HEOS now-playing + Audyssey offsets (see mock_client.py).
            self.media_state = dict(DEMO_MEDIA_STATE)
            self.speaker_calibration = dict(DEMO_SPEAKER_CALIBRATION)

        # Primes the dedupe cache; no WebSocket client is connected yet, and
        # each new client gets its own initial frame on connect.
        await self.broadcast_state()

    async def _on_heos_event(self, event: dict[str, Any]) -> None:
        """Handle unsolicited HEOS events to update media state.

        The receiver namespaces unsolicited events as ``event/player_state_changed``
        and ``event/player_now_playing_changed``. The bare ``player/state_changed``
        form is a *response* command name and never arrives as an event — matching on
        it dropped every change event and froze now_playing/play_state at whatever
        they were when HEOS last connected.
        """
        heos = event.get("heos", {})
        cmd = heos.get("command", "")
        name = cmd[len("event/"):] if cmd.startswith("event/") else cmd
        msg = parse_heos_message(heos.get("message", ""))
        changed = False

        # Ignore events for other players (grouped/multi-room setups).
        pid = msg.get("pid")
        if pid and self.heos and self.heos.player_id and str(self.heos.player_id) != pid:
            return

        if name == "player_state_changed":
            state = msg.get("state")
            if state and state != self.media_state.get("play_state"):
                self.media_state["play_state"] = state
                changed = True
        elif name == "player_now_playing_changed":
            if self.heos and self.heos.connected:
                # The event carries no payload — fetch the full track info.
                now_playing = await self.heos.get_now_playing()
                # None means the fetch timed out or failed: keep what we have
                # instead of blanking Now Playing (same rule as the resync).
                if now_playing is not None and now_playing != self.media_state.get("now_playing"):
                    self.media_state["now_playing"] = now_playing
                    changed = True

        if changed:
            await self.broadcast_state()

    async def refresh_media_state(self) -> bool:
        """Re-poll HEOS for now-playing + play state. Returns True if anything changed.

        Safety net: change-event delivery stops silently whenever the HEOS socket is
        re-established without a successful re-registration, and nothing in the
        protocol surfaces that. Without a periodic resync the cache can stay wrong for
        weeks (it did, until 2026-08-09).
        """
        if not self.heos:
            return False
        if not self.heos.connected:
            # A socket dropped while the AVR was in standby stays dead until
            # someone issues a command. This 30 s tick is the only thing that will
            # notice. ensure_connected() is single-flight and never raises.
            if not await self.heos.ensure_connected():
                return False

        try:
            now_playing = await self.heos.get_now_playing()
            play_state = await self.heos.get_play_state()
        except Exception as exc:
            _LOGGER.debug("HEOS media state refresh failed: %s", exc)
            return False

        changed = False
        if now_playing is not None and now_playing != self.media_state.get("now_playing"):
            self.media_state["now_playing"] = now_playing
            changed = True
        if play_state is not None and play_state != self.media_state.get("play_state"):
            self.media_state["play_state"] = play_state
            changed = True
        return changed

    async def refresh_speaker_calibration(self) -> bool:
        """Re-fetch the Audyssey calibration offsets. Returns True if anything changed.

        The offsets are read once over HTTP at connect time; nothing in the telnet
        protocol announces a change to them. Re-running Audyssey or editing a level
        in the receiver's own setup menu therefore left the dashboard showing the
        OLD offset forever, while its trim still read +-0 — the UI adds
        calibration + trim, so a stale offset silently falsifies the displayed dB
        (SW stuck at -11.0 dB after the receiver had been reset to 0, 2026-08-16).

        A failed or empty fetch keeps the previous cache: the receiver's HTTP API is
        unreachable while it is in standby, and dropping the offsets there would make
        every level jump to pure trim.
        """
        host = self.receiver_host
        if not host:
            return False

        from calibration import fetch_speaker_calibration

        cal = await fetch_speaker_calibration(host)
        if not cal or cal == self.speaker_calibration:
            return False

        _LOGGER.info(
            "Speaker calibration changed: %s -> %s", self.speaker_calibration, cal
        )
        # A single attribute assignment; no lock (and no await) needed.
        self.speaker_calibration = cal
        return True

    async def connect_to_host(self, host: str) -> None:
        """Connect telnet + HEOS for a given host IP.

        `_connect_lock` serialises connects (two quick `POST /connect`s used to
        orphan a pair of clients). `_lock` guards only the swap, so Night Mode
        and the calibration refresh no longer stall behind a slow connect.
        """
        from calibration import fetch_speaker_calibration

        async with self._connect_lock:
            async with self.locked():
                old_telnet, old_heos = self.telnet, self.heos
                # Set before connecting: /device reports the host even while
                # an unreachable receiver keeps the link down.
                self.receiver_host = host

            calibration = await fetch_speaker_calibration(host)

            if old_telnet:
                await old_telnet.disconnect()
            if old_heos:
                await old_heos.disconnect()

            telnet_client = DenonTelnetClient(host, settings.denon_telnet_port)
            telnet_client.on_state_change(self._broadcast_on_change)
            heos_client = HeosClient(host, settings.denon_heos_port)
            heos_client.on_event(self._on_heos_event)

            # Assign before the initial poll (as start_demo does) so the
            # API and build_status() see the new clients right away.
            async with self.locked():
                self.telnet = telnet_client
                self.heos = heos_client
                self.speaker_calibration = calibration

            try:
                await telnet_client.connect()
                _LOGGER.info("Telnet connected to %s:%s", host, settings.denon_telnet_port)
            except Exception as exc:
                _LOGGER.warning(
                    "Initial telnet connection to %s failed: %s "
                    "(supervisor keeps retrying)", host, exc
                )
            finally:
                # ALWAYS supervise, connected or not. Until 2026-09-07 the failure
                # branch above only *claimed* a background retry: nothing started
                # one, so an AVR that was in standby at startup left the dashboard
                # permanently at connected:false.
                telnet_client.start()

            # Single-flight and never raises; failures are logged by the client.
            await heos_client.ensure_connected()

            # Discover available HEOS music services and initial media state
            if heos_client.connected:
                try:
                    sources = await heos_client.get_music_sources()
                    self.heos_available_services = {s["name"] for s in sources}
                    _LOGGER.info("HEOS music services: %s", self.heos_available_services)

                    # Initial state fetch
                    await self.refresh_media_state()
                except Exception as exc:
                    _LOGGER.warning("Failed to fetch initial HEOS state: %s", exc)

                # Radio station cache for the browser/search. Supervised and
                # retried by the media resync while HEOS stays connected.
                from radio_service import ensure_radio_preload

                ensure_radio_preload()

        # Notify all connected WebSocket clients that state changed
        await self.broadcast_state()


# Singleton instance — imported by main.py and all route modules
app_state = AppState()
