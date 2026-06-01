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
    TELNET_FEEDBACK_POLL_INTERVAL,
    TELNET_MAX_RECONNECT,
    TELNET_RECONNECT_DELAY,
    TELNET_TIMEOUT,
    TONE_0DB,
    VOLUME_0DB,
)

_LOGGER = logging.getLogger(__name__)

# regex for channel volume lines: CV<CH> <VAL>
_CV_RE = re.compile(r"^CV([A-Z0-9]+)\s+(\d+)$")

# Strict validation for raw telnet commands (from shared constant)
_COMMAND_RE = re.compile(COMMAND_PATTERN)


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
        self._feedback_poll_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._shutting_down = False
        self._reconnecting = False
        self._send_lock = asyncio.Lock()

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
            self._feedback_poll_task = asyncio.create_task(self._feedback_poll())

            # initial status poll
            await self._poll_status()
        except Exception as exc:
            _LOGGER.error("Connection failed: %s", exc)
            self._connected = False
            raise

    async def disconnect(self) -> None:
        self._shutting_down = True
        self._connected = False
        for task in (
            self._listen_task,
            self._heartbeat_task,
            self._feedback_poll_task,
            self._reconnect_task,
        ):
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
            async with self._send_lock:
                if not self._connected or not self._writer:
                    _LOGGER.warning("Not connected, cannot send: %s", command)
                    return False
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
                            _LOGGER.debug("RX: %s", text)
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

    async def _feedback_poll(self) -> None:
        """Poll fast-changing controls that some receivers do not push unsolicited."""
        cmds = ("MV?", "MU?")
        while self._connected:
            try:
                await asyncio.sleep(TELNET_FEEDBACK_POLL_INTERVAL)
                if not self._connected:
                    return
                for cmd in cmds:
                    await self.send(cmd)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                _LOGGER.debug("Feedback poll error: %s", exc)
                return

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
                _LOGGER.info("Reconnect attempt %d to %s", attempt, self.host)
                try:
                    await asyncio.sleep(TELNET_RECONNECT_DELAY)
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

    async def _parse(self, line: str) -> None:
        changed = False

        # Power: PW = system power (on if ANY zone active), ZM = main zone only
        if line == "PWSTANDBY":
            # System standby → everything off
            self.state["power"] = False; changed = True
        elif line == "PWON":
            # System on, but main zone might still be off — don't set power=True here
            # We rely on ZM responses for main zone state
            pass
        elif line == "ZMON":
            self.state["power"] = True; changed = True
        elif line == "ZMOFF":
            self.state["power"] = False; changed = True

        # Master volume
        elif line.startswith("MV") and not line.startswith("MVMAX"):
            vol = self._parse_volume(line[2:])
            if vol is not None and self.state.get("volume") != vol:
                self.state["volume"] = vol; changed = True
        elif line.startswith("MVMAX"):
            vol = self._parse_volume(line[5:])
            if vol is not None:
                self.state["volume_max"] = vol

        # Mute
        elif line == "MUON":
            if self.state.get("muted") is not True:
                self.state["muted"] = True; changed = True
        elif line == "MUOFF":
            if self.state.get("muted") is not False:
                self.state["muted"] = False; changed = True

        # Source
        elif line.startswith("SI"):
            self.state["source"] = line[2:]; changed = True

        # Surround mode
        elif line.startswith("MS"):
            self.state["surround_mode"] = line[2:]; changed = True

        # Channel volumes
        elif line.startswith("CV") and line != "CVEND":
            m = _CV_RE.match(line)
            if m:
                ch, val = m.group(1), int(m.group(2))
                if ch in CHANNEL_NAMES:
                    self.state["channel_volumes"][ch] = val
                    changed = True

        # Tone control
        elif line.startswith("PSTONE CTRL"):
            val = line.split()[-1]
            self.state["tone_control"] = val == "ON"; changed = True
        elif line.startswith("PSBAS"):
            val = line[5:].strip()
            if val not in ("?", ""):
                try:
                    self.state["bass"] = int(val); changed = True
                except ValueError:
                    pass
        elif line.startswith("PSTRE"):
            val = line[5:].strip()
            if val not in ("?", ""):
                try:
                    self.state["treble"] = int(val); changed = True
                except ValueError:
                    pass

        # Dialog level
        elif line.startswith("PSDIL"):
            val = line[5:].strip()
            if val == "ON":
                self.state["dialog_level_enabled"] = True; changed = True
            elif val == "OFF":
                self.state["dialog_level_enabled"] = False; changed = True
            else:
                try:
                    self.state["dialog_level"] = int(val); changed = True
                except ValueError:
                    pass

        # Subwoofer level
        elif line.startswith("PSSWL2"):
            val = line[6:].strip()
            if val not in ("ON", "OFF", "?", ""):
                try:
                    self.state["subwoofer2_level"] = int(val); changed = True
                except ValueError:
                    pass
        elif line.startswith("PSSWL"):
            val = line[5:].strip()
            if val == "ON":
                pass  # subwoofer enabled
            elif val == "OFF":
                self.state["subwoofer_level"] = None; changed = True
            elif val not in ("?", ""):
                try:
                    self.state["subwoofer_level"] = int(val); changed = True
                except ValueError:
                    pass

        # MultEQ
        elif line.startswith("PSMULTEQ:"):
            self.state["multeq"] = line[9:].strip(); changed = True

        # Dynamic EQ
        elif line.startswith("PSDYNEQ"):
            val = line[7:].strip()
            if val in ("ON", "OFF"):
                self.state["dynamic_eq"] = val == "ON"; changed = True

        # Dynamic Volume
        elif line.startswith("PSDYNVOL"):
            val = line[8:].strip()
            if val != "?":
                self.state["dynamic_volume"] = val; changed = True

        # Reference level offset
        elif line.startswith("PSREFLEV"):
            val = line[8:].strip()
            if val != "?":
                try:
                    self.state["ref_level_offset"] = int(val); changed = True
                except ValueError:
                    pass

        # Sleep timer
        elif line.startswith("SLP"):
            val = line[3:].strip()
            if val == "OFF":
                self.state["sleep_timer"] = None; changed = True
            else:
                try:
                    self.state["sleep_timer"] = int(val); changed = True
                except ValueError:
                    pass

        # Eco mode
        elif line.startswith("ECO"):
            val = line[3:].strip()
            if val != "?" and val:
                self.state["eco_mode"] = val; changed = True

        # Friendly name (NSFRN <name>)
        elif line.startswith("NSFRN"):
            name = line[5:].strip()
            if name and name != "?":
                self.state["friendly_name"] = name
                changed = True

        # Source function names (SSFUN<CODE> <DisplayName>)
        elif line.startswith("SSFUN"):
            payload = line[5:]  # strip "SSFUN"
            if payload.strip() == "END":
                pass  # end-of-list sentinel
            elif " " in payload:
                code, name = payload.split(" ", 1)
                name = name.strip()
                if code and name:
                    self.state["source_names"][code] = name
                    changed = True

        # Source on/delete (SSSOD<CODE> USE|DEL)
        elif line.startswith("SSSOD"):
            payload = line[5:]  # strip "SSSOD"
            if payload.strip() == "END":
                pass
            elif " " in payload:
                code, status = payload.rsplit(" ", 1)
                code = code.strip()
                if code and status == "DEL":
                    self.state["hidden_sources"].add(code)
                    changed = True
                elif code and status == "USE":
                    self.state["hidden_sources"].discard(code)
                    changed = True

        # Sound decoder (SDAUTO, SDHDMI, SDDIGITAL, etc.)
        elif line.startswith("SD"):
            val = line[2:]
            if val and val != "?":
                self.state["sound_decoder"] = val; changed = True

        # Surround mode list (OPSMLALL {CAT}{ID}{ACTIVE}{DisplayName})
        elif line.startswith("OPSMLALL"):
            payload = line[9:]  # strip "OPSMLALL "
            if payload == "END":
                self.state["surround_mode_list"] = self._opsmlall_buffer
                self._opsmlall_buffer = []
                # Command mapping is handled by KNOWN_MODE_COMMANDS at parse time.
                # No dynamic learning — MS events and OPSMLALL interleave during
                # rapid cycling, making runtime correlation unreliable.
                changed = True
            elif len(payload) >= 7:
                cat = payload[:3]
                sort_id = payload[3:5]
                active = payload[5] == "1"
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

        # Zone 2
        elif line == "Z2ON":
            self.state["z2_power"] = True; changed = True
        elif line == "Z2OFF":
            self.state["z2_power"] = False; changed = True
        elif line == "Z2MUON":
            self.state["z2_muted"] = True; changed = True
        elif line == "Z2MUOFF":
            self.state["z2_muted"] = False; changed = True
        elif line.startswith("Z2SLP"):
            # Zone 2 sleep timer — ignore for now (not exposed in UI)
            pass
        elif line.startswith("Z2"):
            part = line[2:]
            if part.isdigit():
                self.state["z2_volume"] = int(part); changed = True
            elif part and not part.endswith("?") and part not in ("MU", "SLP"):
                self.state["z2_source"] = part; changed = True

        if changed:
            await self._notify()

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
