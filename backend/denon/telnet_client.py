"""Async telnet client for Denon AVR receivers."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Callable, Coroutine

from .const import (
    CHANNEL_NAMES,
    COMMAND_INTERVAL,
    COMMAND_PATTERN,
    CV_0DB,
    DEFAULT_TELNET_PORT,
    KNOWN_MODE_COMMANDS,
    QUERY_COMMANDS,
    SURROUND_CATEGORIES,
    SWL_0DB,
    TELNET_HEARTBEAT_INTERVAL,
    TELNET_MAX_RECONNECT,
    TELNET_RECONNECT_DELAY,
    TELNET_RECONNECT_MAX_DELAY,
    TELNET_TIMEOUT,
    TONE_0DB,
    VOLUME_0DB,
)

_LOGGER = logging.getLogger(__name__)

# regex for channel volume lines: CV<CH> <VAL>
_CV_RE = re.compile(r"^CV([A-Z0-9]+)\s+(\d+)$")

# Strict validation for raw telnet commands (from shared constant)
_COMMAND_RE = re.compile(COMMAND_PATTERN)

# Prefixes whose payloads can reveal device topology / user-chosen labels.
# Redacted in DEBUG RX logs so log scrapes never carry the receiver's friendly
# name or per-source display names.
_REDACTED_RX_PREFIXES = ("NSFRN", "SSFUN", "SSSOD")


def _redact_rx(line: str) -> str:
    for prefix in _REDACTED_RX_PREFIXES:
        if line.startswith(prefix):
            return f"{prefix} <redacted>"
    return line


class DenonTelnetClient:
    """Async telnet client for Denon AVR."""

    def __init__(self, host: str, port: int = DEFAULT_TELNET_PORT) -> None:
        self.host = host
        self.port = port

        # connection
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._connected = False
        self._listen_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._shutting_down = False
        self._reconnecting = False

        # state
        self.state: dict[str, Any] = {
            "power": None,
            "volume": None,
            "volume_max": None,
            "muted": None,
            "source": None,
            "surround_mode": None,
            "channel_volumes": {},
            "source_names": {},  # discovered via SSFUN: {code: display_name}
            "hidden_sources": set(),  # sources marked DEL via SSSOD
            "friendly_name": None,  # discovered via NSFRN
            "tone_control": None,
            "bass": None,
            "treble": None,
            "subwoofer_level": None,
            "subwoofer2_level": None,
            "dialog_level": None,
            "dialog_level_enabled": None,
            "multeq": None,
            "dynamic_eq": None,
            "dynamic_volume": None,
            "ref_level_offset": None,
            "sleep_timer": None,
            "eco_mode": None,
            # Zone 2
            "sound_decoder": None,
            "surround_mode_list": [],
            # Zone 2
            "z2_power": None,
            "z2_volume": None,
            "z2_muted": None,
            "z2_sleep_timer": None,
            "z2_source": None,
        }

        # OPSMLALL accumulation buffer
        self._opsmlall_buffer: list[dict] = []

        # callbacks: list of async callables(state_dict)
        self._callbacks: list[Callable[[dict[str, Any]], Coroutine]] = []

    # -- public api --

    @property
    def connected(self) -> bool:
        return self._connected

    def on_state_change(self, cb: Callable[[dict[str, Any]], Coroutine]) -> None:
        self._callbacks.append(cb)

    async def connect(self) -> None:
        """Connect to the receiver."""
        self._shutting_down = False
        try:
            _LOGGER.info("Connecting to %s:%s", self.host, self.port)
            fut = asyncio.open_connection(self.host, self.port)
            self._reader, self._writer = await asyncio.wait_for(fut, timeout=TELNET_TIMEOUT)
            self._connected = True
            _LOGGER.info("Connected to Denon AVR at %s:%s", self.host, self.port)

            self._listen_task = asyncio.create_task(self._listen())
            self._heartbeat_task = asyncio.create_task(self._heartbeat())

            # initial status poll
            await self._poll_status()
        except Exception as exc:
            _LOGGER.error("Connection failed: %s", exc)
            self._connected = False
            raise

    async def disconnect(self) -> None:
        self._shutting_down = True
        self._connected = False
        for task in (self._listen_task, self._heartbeat_task, self._reconnect_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        if self._writer:
            self._writer.close()
            try:
                await self._writer.wait_closed()
            except Exception:
                pass
        self._writer = None
        self._reader = None

    async def send(self, command: str) -> bool:
        """Send a raw telnet command (without CR)."""
        if not isinstance(command, str) or not _COMMAND_RE.match(command):
            _LOGGER.warning("Invalid command rejected: %s", command)
            return False
            
        if not self._connected or not self._writer:
            _LOGGER.warning("Not connected, cannot send: %s", command)
            return False
        try:
            self._writer.write(f"{command}\r".encode())
            await self._writer.drain()
            await asyncio.sleep(COMMAND_INTERVAL)
            return True
        except Exception as exc:
            _LOGGER.error("Send failed (%s): %s", command, exc)
            asyncio.create_task(self._handle_disconnect())
            return False

    async def refresh(self) -> None:
        """Re-poll all status."""
        await self._poll_status()

    # -- internals --

    async def _poll_status(self) -> None:
        for cmd in QUERY_COMMANDS:
            await self.send(cmd)
            await asyncio.sleep(0.08)

    async def _listen(self) -> None:
        """Listen for responses. Denon uses \\r (0x0D) as line terminator, not \\n."""
        buf = b""
        try:
            while self._connected and self._reader:
                try:
                    chunk = await asyncio.wait_for(
                        self._reader.read(4096),
                        timeout=TELNET_HEARTBEAT_INTERVAL + 15,
                    )
                    if not chunk:
                        await self._handle_disconnect()
                        return
                    buf += chunk
                    if len(buf) > 102400:  # 100 KB safety limit
                        _LOGGER.error("Telnet buffer overflow (%d bytes), disconnecting", len(buf))
                        await self._handle_disconnect()
                        return
                    # Split on \r (0x0D) — Denon protocol line terminator
                    while b"\r" in buf:
                        line_bytes, buf = buf.split(b"\r", 1)
                        text = line_bytes.decode(errors="ignore").strip()
                        if text:
                            _LOGGER.debug("RX: %s", _redact_rx(text))
                            await self._parse(text)
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LOGGER.error("Listen error: %s", exc)
            await self._handle_disconnect()

    async def _heartbeat(self) -> None:
        cmds = ["PW?", "MV?", "MU?"]
        idx = 0
        while self._connected:
            try:
                await asyncio.sleep(TELNET_HEARTBEAT_INTERVAL)
                if self._connected:
                    await self.send(cmds[idx % len(cmds)])
                    idx += 1
            except asyncio.CancelledError:
                raise
            except Exception:
                break

    async def _handle_disconnect(self) -> None:
        if not self._connected and not self._shutting_down:
            return
        _LOGGER.warning("Connection lost to %s", self.host)
        self._connected = False
        await self._notify()
        if not self._shutting_down and not self._reconnecting:
            self._reconnecting = True
            self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        attempt = 0
        try:
            while not self._shutting_down:
                attempt += 1
                delay = min(
                    TELNET_RECONNECT_DELAY * (2 ** min(attempt - 1, 5)),
                    TELNET_RECONNECT_MAX_DELAY,
                )
                _LOGGER.info(
                    "Reconnect attempt %d to %s in %ds", attempt, self.host, delay
                )
                try:
                    await asyncio.sleep(delay)
                    await self.connect()
                    _LOGGER.info("Reconnected to %s", self.host)
                    return
                except Exception as exc:
                    _LOGGER.warning("Reconnect attempt %d failed: %s", attempt, exc)
                    if TELNET_MAX_RECONNECT and attempt >= TELNET_MAX_RECONNECT:
                        _LOGGER.error("Max reconnect attempts reached")
                        return
        finally:
            self._reconnecting = False

    # -- parser --

    def _init_handlers(self) -> None:
        if hasattr(self, "_handlers"):
            return
        self._handlers = [
            (re.compile(r"^PW(STANDBY|ON)$"), self._handle_power),
            (re.compile(r"^ZM(ON|OFF)$"), self._handle_zone_main),
            (re.compile(r"^MV(MAX\s*\d{2,3}|\d{2,3})$"), self._handle_volume),
            (re.compile(r"^MU(ON|OFF)$"), self._handle_mute),
            (re.compile(r"^SI(.+)$"), self._handle_source),
            (re.compile(r"^MS(.+)$"), self._handle_surround_mode),
            (re.compile(r"^CV([A-Z0-9]+)\s+(\d+)$"), self._handle_channel_volume),
            (re.compile(r"^PSTONE CTRL(.+)$"), self._handle_tone_ctrl),
            (re.compile(r"^PSBAS(.+)$"), self._handle_bass),
            (re.compile(r"^PSTRE(.+)$"), self._handle_treble),
            (re.compile(r"^PSDIL(.+)$"), self._handle_dialog),
            (re.compile(r"^PSSWL2(.+)$"), self._handle_subwoofer2),
            (re.compile(r"^PSSWL(.+)$"), self._handle_subwoofer),
            (re.compile(r"^PSMULTEQ:(.+)$"), self._handle_multeq),
            (re.compile(r"^PSDYNEQ(.+)$"), self._handle_dyneq),
            (re.compile(r"^PSDYNVOL(.+)$"), self._handle_dynvol),
            (re.compile(r"^PSREFLEV(.+)$"), self._handle_reflev),
            (re.compile(r"^SLP(.+)$"), self._handle_sleep),
            (re.compile(r"^ECO(.+)$"), self._handle_eco),
            (re.compile(r"^NSFRN\s*(.+)$"), self._handle_nsfrn),
            (re.compile(r"^SSFUN(.+)$"), self._handle_ssfun),
            (re.compile(r"^SSSOD(.+)$"), self._handle_sssod),
            (re.compile(r"^SD(.+)$"), self._handle_sd),
            (re.compile(r"^OPSMLALL(.*)$"), self._handle_opsmlall),
            # Z2 payloads: power/mute, sleep (SLP<value>), volume (2-3 digits),
            # or a source code (uppercase + digits + '/', 2-12 chars). The
            # source class is intentionally tight so unknown Z2... lines do
            # not silently get stored as z2_source.
            (
                re.compile(
                    r"^Z2(ON|OFF|MUON|MUOFF|SLP[A-Z0-9]+|\d{2,3}|[A-Z][A-Z0-9/]{1,11})$"
                ),
                self._handle_zone2,
            ),
        ]

    async def _parse(self, line: str) -> None:
        self._init_handlers()
        for pattern, handler in self._handlers:
            match = pattern.match(line)
            if match:
                if handler(match):
                    await self._notify()
                return

    def _handle_power(self, match: re.Match) -> bool:
        if match.group(1) == "STANDBY":
            self.state["power"] = False
            return True
        return False

    def _handle_zone_main(self, match: re.Match) -> bool:
        self.state["power"] = (match.group(1) == "ON")
        return True

    def _handle_volume(self, match: re.Match) -> bool:
        val = match.group(1)
        if val.startswith("MAX"):
            v = self._parse_volume(val[3:])
            if v is not None:
                self.state["volume_max"] = v
            return False
        else:
            v = self._parse_volume(val)
            if v is not None:
                self.state["volume"] = v
                return True
        return False

    def _handle_mute(self, match: re.Match) -> bool:
        self.state["muted"] = (match.group(1) == "ON")
        return True

    def _handle_source(self, match: re.Match) -> bool:
        self.state["source"] = match.group(1)
        return True

    def _handle_surround_mode(self, match: re.Match) -> bool:
        self.state["surround_mode"] = match.group(1)
        return True

    def _handle_channel_volume(self, match: re.Match) -> bool:
        ch, val = match.group(1), int(match.group(2))
        if ch in CHANNEL_NAMES:
            self.state["channel_volumes"][ch] = val
            return True
        return False

    def _handle_tone_ctrl(self, match: re.Match) -> bool:
        self.state["tone_control"] = (match.group(1).strip() == "ON")
        return True

    def _handle_bass(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val not in ("?", ""):
            try:
                self.state["bass"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_treble(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val not in ("?", ""):
            try:
                self.state["treble"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_dialog(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "ON":
            self.state["dialog_level_enabled"] = True
            return True
        elif val == "OFF":
            self.state["dialog_level_enabled"] = False
            return True
        elif val not in ("?", ""):
            try:
                self.state["dialog_level"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_subwoofer2(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val not in ("ON", "OFF", "?", ""):
            try:
                self.state["subwoofer2_level"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_subwoofer(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "OFF":
            self.state["subwoofer_level"] = None
            return True
        elif val not in ("ON", "?", ""):
            try:
                self.state["subwoofer_level"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_multeq(self, match: re.Match) -> bool:
        self.state["multeq"] = match.group(1).strip()
        return True

    def _handle_dyneq(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val in ("ON", "OFF"):
            self.state["dynamic_eq"] = (val == "ON")
            return True
        return False

    def _handle_dynvol(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val != "?":
            self.state["dynamic_volume"] = val
            return True
        return False

    def _handle_reflev(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val != "?":
            try:
                self.state["ref_level_offset"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_sleep(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "OFF":
            self.state["sleep_timer"] = None
            return True
        else:
            try:
                self.state["sleep_timer"] = int(val)
                return True
            except ValueError: pass
        return False

    def _handle_eco(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val != "?" and val:
            self.state["eco_mode"] = val
            return True
        return False

    def _handle_nsfrn(self, match: re.Match) -> bool:
        name = match.group(1).strip()
        if name and name != "?":
            self.state["friendly_name"] = name
            return True
        return False

    def _handle_ssfun(self, match: re.Match) -> bool:
        payload = match.group(1)
        if payload.strip() == "END":
            return False
        if " " in payload:
            code, name = payload.split(" ", 1)
            name = name.strip()
            if code and name:
                self.state["source_names"][code] = name
                return True
        return False

    def _handle_sssod(self, match: re.Match) -> bool:
        payload = match.group(1)
        if payload.strip() == "END":
            return False
        if " " in payload:
            code, status = payload.rsplit(" ", 1)
            code = code.strip()
            if code and status == "DEL":
                self.state["hidden_sources"].add(code)
                return True
            elif code and status == "USE":
                self.state["hidden_sources"].discard(code)
                return True
        return False

    def _handle_sd(self, match: re.Match) -> bool:
        val = match.group(1)
        if val and val != "?":
            self.state["sound_decoder"] = val
            return True
        return False

    def _handle_opsmlall(self, match: re.Match) -> bool:
        payload = match.group(1).lstrip()
        if payload == "END":
            self.state["surround_mode_list"] = self._opsmlall_buffer
            self._opsmlall_buffer = []
            return True
        elif len(payload) >= 7:
            cat = payload[:3]
            sort_id = payload[3:5]
            active = (payload[5] == "1")
            display_name = payload[6:]
            telnet_cmd = KNOWN_MODE_COMMANDS.get(display_name)
            self._opsmlall_buffer.append({
                "category": cat,
                "category_label": SURROUND_CATEGORIES.get(cat, cat),
                "id": sort_id,
                "active": active,
                "display_name": display_name,
                "command": telnet_cmd,
            })
        return False

    def _handle_zone2(self, match: re.Match) -> bool:
        val = match.group(1)
        if val == "ON":
            self.state["z2_power"] = True
            return True
        elif val == "OFF":
            self.state["z2_power"] = False
            return True
        elif val == "MUON":
            self.state["z2_muted"] = True
            return True
        elif val == "MUOFF":
            self.state["z2_muted"] = False
            return True
        elif val.startswith("SLP"):
            v = val[3:].strip()
            if v == "OFF":
                self.state["z2_sleep_timer"] = None
                return True
            else:
                try:
                    self.state["z2_sleep_timer"] = int(v)
                    return True
                except ValueError: pass
        elif val.isdigit():
            self.state["z2_volume"] = int(val)
            return True
        elif val:
            self.state["z2_source"] = val
            return True
        return False

    def _parse_volume(self, s: str) -> float | None:
        s = s.strip()
        if not s:
            return None
        try:
            if len(s) == 3 and s[2] == "5":
                return int(s[:2]) + 0.5
            return float(int(s))
        except ValueError:
            return None

    async def _notify(self) -> None:
        for cb in self._callbacks:
            try:
                await cb(self.state)
            except Exception as exc:
                _LOGGER.error("Callback error: %s", exc)
