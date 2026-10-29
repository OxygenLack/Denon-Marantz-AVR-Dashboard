"""Async telnet client for Denon AVR receivers."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable, Coroutine
from typing import Any

from .const import (
    COMMAND_INTERVAL,
    COMMAND_RE,
    DEFAULT_TELNET_PORT,
    POLL_GAP,
    QUERY_COMMANDS,
    TELNET_HEARTBEAT_INTERVAL,
    TELNET_RECONNECT_DELAY,
    TELNET_RECONNECT_LOG_EVERY,
    TELNET_RECONNECT_MAX_DELAY,
    TELNET_SUPERVISOR_INTERVAL,
    TELNET_TIMEOUT,
)
from .telnet_parser import TelnetParserMixin

_LOGGER = logging.getLogger(__name__)

# Prefixes whose payloads can reveal device topology / user-chosen labels.
# Redacted in DEBUG RX logs so log scrapes never carry the receiver's friendly
# name or per-source display names.
_REDACTED_RX_PREFIXES = ("NSFRN", "SSFUN", "SSSOD")


def _redact_rx(line: str) -> str:
    for prefix in _REDACTED_RX_PREFIXES:
        if line.startswith(prefix):
            return f"{prefix} <redacted>"
    return line


class DenonTelnetClient(TelnetParserMixin):
    """Async telnet client for Denon AVR. Line parsing lives in TelnetParserMixin."""

    def __init__(self, host: str, port: int = DEFAULT_TELNET_PORT) -> None:
        self.host = host
        self.port = port

        # connection
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._connected = False
        self._listen_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._supervisor_task: asyncio.Task | None = None
        self._shutting_down = False
        # Serialises writes so the COMMAND_INTERVAL gap holds between
        # concurrent senders (route handlers, heartbeat, status poll).
        self._send_lock = asyncio.Lock()

        # link diagnostics (surfaced via `link_status` and /metrics)
        self._reconnect_attempts = 0
        self._connects_total = 0
        self._last_connected_at: float | None = None
        self._last_error: str | None = None

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
            "sound_decoder": None,
            "surround_mode_list": [],
            # Zone 2
            "z2_power": None,
            "z2_volume": None,
            "z2_muted": None,
            "z2_sleep_timer": None,
            "z2_source": None,
        }

        # OPSMLALL accumulation buffer (see TelnetParserMixin._handle_opsmlall)
        self._opsmlall_buffer: list[dict] = []
        self._opsmlall_overflow_logged = False

        # callbacks: list of async callables(state_dict)
        self._callbacks: list[Callable[[dict[str, Any]], Coroutine]] = []

        # Notification coalescing. `_listen()` never awaits a callback: it marks
        # the state dirty and a short-lived broadcaster task runs the callbacks.
        # One slow WebSocket client used to freeze telnet reading for up to 5 s
        # per line (the same class of bug as the fixed HEOS reader deadlock).
        self._dirty = False
        self._broadcaster: asyncio.Task | None = None

    # -- public api --

    @property
    def connected(self) -> bool:
        return self._connected

    def on_state_change(self, cb: Callable[[dict[str, Any]], Coroutine]) -> None:
        self._callbacks.append(cb)

    @property
    def link_status(self) -> dict[str, Any]:
        """Diagnostics about the telnet link itself (not the receiver state)."""
        return {
            "connected": self._connected,
            "host": self.host,
            "port": self.port,
            "supervised": self._supervisor_task is not None
            and not self._supervisor_task.done(),
            "reconnect_attempts": self._reconnect_attempts,
            "connects_total": self._connects_total,
            "last_connected_at": self._last_connected_at,
            "last_error": self._last_error,
        }

    def start(self) -> None:
        """Start the connection supervisor. Idempotent, never raises.

        This is the entry point callers should use instead of a bare ``connect()``.
        ``connect()`` is a one-shot that raises on failure; if the receiver happens
        to be in standby at that moment there is nothing left to retry it, and the
        link stays dead until the process restarts (real outage 2026-09-04 ->
        2026-09-07, ~29 h of `Not connected, cannot send`).
        """
        self._shutting_down = False
        if self._supervisor_task is None or self._supervisor_task.done():
            self._supervisor_task = asyncio.create_task(self._supervisor())

    async def connect(self) -> None:
        """Connect to the receiver once. Raises on failure.

        Prefer `start()`, which calls this in a retry loop for the process lifetime.
        """
        self._shutting_down = False
        await self._teardown_socket()
        try:
            _LOGGER.debug("Connecting to %s:%s", self.host, self.port)
            fut = asyncio.open_connection(self.host, self.port)
            self._reader, self._writer = await asyncio.wait_for(fut, timeout=TELNET_TIMEOUT)
            self._connected = True
            self._connects_total += 1
            self._last_connected_at = time.time()
            self._last_error = None
            _LOGGER.info("Connected to Denon AVR at %s:%s", self.host, self.port)

            self._listen_task = asyncio.create_task(self._listen())
            self._heartbeat_task = asyncio.create_task(self._heartbeat())

            # initial status poll
            await self._poll_status()
            if not self._connected:
                # The poll swallows a send failure; without this the supervisor
                # would log "up again" for a link that is already gone.
                raise ConnectionError("link dropped during initial status poll")
        except Exception as exc:
            # Logged by the supervisor (throttled) — logging at ERROR here would
            # emit one line every retry for as long as the AVR is switched off.
            _LOGGER.debug("Connection to %s:%s failed: %s", self.host, self.port, exc)
            self._last_error = str(exc)
            self._connected = False
            await self._teardown_socket()
            raise

    async def _supervisor(self) -> None:
        """Own the telnet link for the whole process lifetime.

        Reconnects forever with exponential backoff, capped at
        TELNET_RECONNECT_MAX_DELAY. Deliberately covers the case where the *first*
        connect already failed — that is the case the old inline reconnect loop
        could not reach, because it was only ever started from a drop of an
        already-established connection.
        """
        while not self._shutting_down:
            if self._connected:
                self._reconnect_attempts = 0
                await asyncio.sleep(TELNET_SUPERVISOR_INTERVAL)
                continue

            self._reconnect_attempts += 1
            attempt = self._reconnect_attempts
            try:
                await self.connect()
                _LOGGER.info(
                    "Telnet link to %s up again after %d attempt(s)", self.host, attempt
                )
                self._mark_dirty()
                continue
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                delay = min(
                    TELNET_RECONNECT_DELAY * (2 ** min(attempt - 1, 5)),
                    TELNET_RECONNECT_MAX_DELAY,
                )
                if attempt == 1 or attempt % TELNET_RECONNECT_LOG_EVERY == 0:
                    _LOGGER.warning(
                        "Telnet connect to %s:%s failed (attempt %d): %s "
                        "— retrying every %ds",
                        self.host, self.port, attempt, exc, delay,
                    )
                await asyncio.sleep(delay)

    async def _cancel(self, task: asyncio.Task | None) -> None:
        """Cancel a task unless it is the one we are currently running in.

        `_handle_disconnect()` is awaited from inside `_listen()`, so a naive
        cancel there would cancel the caller mid-cleanup.
        """
        if task is None or task is asyncio.current_task():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            # Swallow only the cancelled task's own CancelledError. If the
            # caller itself is being cancelled, propagate it.
            current = asyncio.current_task()
            if current is not None and current.cancelling():
                raise
        except Exception:
            pass

    async def _teardown_socket(self) -> None:
        """Close the socket and stop its reader/heartbeat, without touching the supervisor.

        The old code never closed the writer on a dropped link, so every reconnect
        leaked a socket for the lifetime of the process.
        """
        await self._cancel(self._listen_task)
        await self._cancel(self._heartbeat_task)
        self._listen_task = None
        self._heartbeat_task = None
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._writer = None
        self._reader = None

    async def disconnect(self) -> None:
        self._shutting_down = True
        self._connected = False
        await self._cancel(self._supervisor_task)
        self._supervisor_task = None
        await self._teardown_socket()
        await self._cancel(self._broadcaster)
        self._broadcaster = None

    async def send(self, command: str) -> bool:
        """Send a raw telnet command (without CR)."""
        if not isinstance(command, str) or not COMMAND_RE.match(command):
            _LOGGER.warning("Invalid command rejected: %s", command)
            return False

        if not self._connected or not self._writer:
            _LOGGER.warning("Not connected, cannot send: %s", command)
            return False
        try:
            async with self._send_lock:
                writer = self._writer
                if not self._connected or writer is None:
                    _LOGGER.warning("Not connected, cannot send: %s", command)
                    return False
                writer.write(f"{command}\r".encode())
                await writer.drain()
                await asyncio.sleep(COMMAND_INTERVAL)
            return True
        except Exception as exc:
            _LOGGER.error("Send failed (%s): %s", command, exc)
            # awaited, not fire-and-forget: an unreferenced task can be garbage
            # collected before it runs, and the drop would go unnoticed.
            await self._handle_disconnect()
            return False

    async def refresh(self) -> None:
        """Re-poll all status."""
        await self._poll_status()

    # -- internals --

    async def _poll_status(self) -> None:
        for cmd in QUERY_COMMANDS:
            if not await self.send(cmd):
                # Link dropped mid-poll. Without this the remaining ~20 query
                # commands each log "Not connected, cannot send" — 20 warnings
                # per reconnect, which buries the one line that matters.
                _LOGGER.debug("Status poll aborted at %s (link down)", cmd)
                return
            await asyncio.sleep(POLL_GAP)

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
                except TimeoutError:
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
            await asyncio.sleep(TELNET_HEARTBEAT_INTERVAL)
            if self._connected:
                # send() never raises (failures return False and mark the link down).
                await self.send(cmds[idx % len(cmds)])
                idx += 1

    async def _handle_disconnect(self) -> None:
        """Mark the link down. The supervisor does the reconnecting.

        Recovery deliberately does NOT happen here. Spawning the retry loop from
        the drop path means a link that never came up in the first place is never
        retried, and it made the recovery path depend on which of `_listen()` /
        `send()` noticed the drop first.
        """
        if not self._connected:
            return  # already handled
        _LOGGER.warning(
            "Connection lost to %s — supervisor retries within %ds",
            self.host, TELNET_SUPERVISOR_INTERVAL,
        )
        self._connected = False
        self._mark_dirty()

    # -- notifications --

    def _mark_dirty(self) -> None:
        """Schedule one callback round for the current state. Sync, never blocks.

        Bursts of parsed lines collapse into a single round: while the
        broadcaster is running, further marks only set the flag and the loop
        runs once more when the current round is done.
        """
        self._dirty = True
        if not self._callbacks:
            return
        if self._broadcaster is None or self._broadcaster.done():
            self._broadcaster = asyncio.create_task(self._broadcast_loop())

    async def _broadcast_loop(self) -> None:
        while self._dirty:
            self._dirty = False
            await self._notify()

    async def _notify(self) -> None:
        """Run every callback once with the current state. Exceptions are logged."""
        for cb in self._callbacks:
            try:
                await cb(self.state)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                _LOGGER.error("Callback error: %s", exc)

    async def flush_notifications(self) -> None:
        """Wait until every pending callback round has run (tests)."""
        while self._broadcaster is not None and not self._broadcaster.done():
            await asyncio.wait({self._broadcaster})
