"""Async HEOS CLI client for media transport controls."""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from .const import DEFAULT_HEOS_PORT, HEOS_RECONNECT_LOG_EVERY
from .heos_message import parse_heos_message

_LOGGER = logging.getLogger(__name__)


def _ok(resp: dict[str, Any] | None) -> bool:
    """True when a HEOS reply reports ``result=success``."""
    return resp is not None and resp.get("heos", {}).get("result") == "success"


def _safe_param(value: str | None, max_len: int) -> bool:
    """Reject values that could inject a second HEOS command or are too long."""
    return bool(value) and "\r" not in value and "\n" not in value and len(value) <= max_len


def _to_int(value: str | None, default: int = 0) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


class HeosClient:
    """Lightweight HEOS CLI client (port 1255) for media control."""

    def __init__(self, host: str, port: int = DEFAULT_HEOS_PORT):
        self._host = host
        self._port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        # `_lock` serializes the write of one command; it is held only across
        # write+drain, never across a reconnect. `_connect_lock` makes the
        # reconnect single-flight. They are separate on purpose: asyncio.Lock
        # is not reentrant, and `connect()` issues commands itself.
        self._lock = asyncio.Lock()
        self._connect_lock = asyncio.Lock()
        self._lock_waiters = 0
        self._connecting_task: asyncio.Task | None = None
        # Default per-command timeout (lock wait and reply wait each).
        self.command_timeout = 8.0
        self._pid: int | None = None
        self._listen_task: asyncio.Task | None = None
        self._pending_commands: list[tuple[str, asyncio.Future]] = []
        self._callbacks: list[Callable[[dict[str, Any]], Coroutine]] = []
        self._callback_tasks: set[asyncio.Task] = set()
        # Consecutive failed connects; throttles the warning while the AVR
        # sits in standby (the media resync retries every 30 s).
        self._connect_failures = 0

    def on_event(self, cb: Callable[[dict[str, Any]], Coroutine]) -> None:
        """Register a callback for unsolicited HEOS events."""
        self._callbacks.append(cb)

    async def connect(self) -> None:
        """Connect and discover player ID.

        Prefer `ensure_connected()`, which is single-flight. A second unlocked
        `connect()` while one is in progress would orphan a socket and a listen
        task.
        """
        self._connecting_task = asyncio.current_task()
        try:
            # Use limit=102400 to prevent DoS from excessively long lines
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self._host, self._port, limit=102400), timeout=5
            )
            _LOGGER.debug("HEOS socket open to %s:%s", self._host, self._port)

            # Start background reader
            self._listen_task = asyncio.create_task(self._listen())

            # Discover player. Without a pid every transport command would go
            # out pid-less and fail, so a missing player is a failed connect.
            self._pid = None
            resp = await self._command("player/get_players")
            if resp and "payload" in resp:
                for p in resp["payload"]:
                    self._pid = p.get("pid")
                    _LOGGER.info("HEOS player: %s (pid=%s)", p.get("name"), self._pid)
                    break
            if self._pid is None:
                raise RuntimeError("no HEOS player reported")

            # Enable change events
            await self._command("system/register_for_change_events", "enable=on")
            if self._connect_failures:
                _LOGGER.info(
                    "HEOS link to %s up again after %d attempt(s)",
                    self._host, self._connect_failures + 1,
                )
            else:
                _LOGGER.info("HEOS connected to %s:%s", self._host, self._port)
            self._connect_failures = 0
        except Exception as exc:
            self._connect_failures += 1
            n = self._connect_failures
            level = (
                logging.WARNING
                if n == 1 or n % HEOS_RECONNECT_LOG_EVERY == 0
                else logging.DEBUG
            )
            _LOGGER.log(level, "HEOS connection failed (attempt %d): %s", n, exc)
            await self.disconnect()
        finally:
            self._connecting_task = None

    async def ensure_connected(self) -> bool:
        """Reconnect if the socket is down. Single-flight; never raises.

        Concurrent callers wait on `_connect_lock` and then see the result of the
        one reconnect. Bounded by the connect timeout plus the two handshake
        commands (~5 s + 2 x 8 s worst case).
        """
        if self.connected:
            return True
        async with self._connect_lock:
            if not self.connected:
                await self._reconnect()
        return self.connected

    async def disconnect(self) -> None:
        """Tear down the socket and every task bound to it.

        Never cancels the task it runs in: `_listen()` calls this from its own
        `finally`, and a callback task can trigger a reconnect (callback ->
        `_command()` -> `ensure_connected()` -> here). Cancelling either would
        abort the cleanup mid-way.
        """
        me = asyncio.current_task()
        if self._listen_task:
            if self._listen_task is not me:
                self._listen_task.cancel()
            self._listen_task = None

        # Callbacks may be mid-command against the socket we are about to close.
        for task in list(self._callback_tasks):
            if task is not me:
                task.cancel()
        self._callback_tasks = {t for t in self._callback_tasks if t is me}

        # Resolve, don't cancel: a cancelled future raises CancelledError in
        # whichever task awaited the command, and that killed the 30 s media
        # resync loop whenever the socket dropped mid-poll. None reads as
        # "command failed" in every caller.
        for _, fut in self._pending_commands:
            if not fut.done():
                fut.set_result(None)
        self._pending_commands.clear()

        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None

    @property
    def connected(self) -> bool:
        return self._writer is not None and not self._writer.is_closing()

    @property
    def player_id(self) -> int | None:
        return self._pid

    @property
    def pending_count(self) -> int:
        """Commands written to the socket that are still waiting for a reply."""
        return len(self._pending_commands)

    @property
    def callback_task_count(self) -> int:
        """Event callback tasks currently running."""
        return len(self._callback_tasks)

    @property
    def lock_waiters(self) -> int:
        """Commands currently blocked waiting for the command lock.

        The one view that can see the reentrant-lock deadlock class: a command
        blocked on the lock has not entered the pending list yet.
        """
        return self._lock_waiters

    def _dispatch_event(self, data: dict[str, Any]) -> None:
        """Run event callbacks in their own tasks.

        MUST NOT be awaited from `_listen()`. A callback is allowed to issue HEOS
        commands (e.g. `player_now_playing_changed` -> `get_now_playing()`), and those
        futures are resolved by `_listen()` itself. Awaiting the callback inline
        therefore deadlocks the reader against its own command until the 8s timeout
        fires - and while it is blocked, nothing is read, so every *other* in-flight
        command times out too. That looks exactly like "the receiver stopped
        responding".
        """
        for cb in self._callbacks:
            task = asyncio.create_task(self._run_callback(cb, data))
            self._callback_tasks.add(task)
            task.add_done_callback(self._callback_tasks.discard)

    async def _run_callback(
        self, cb: Callable[[dict[str, Any]], Coroutine], data: dict[str, Any]
    ) -> None:
        try:
            await cb(data)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LOGGER.error("HEOS callback error: %s", exc)

    async def _listen(self) -> None:
        """Background task to read HEOS stream."""
        try:
            while self.connected and self._reader:
                try:
                    line = await self._reader.readline()
                    if not line:
                        break

                    try:
                        data = json.loads(line.decode().strip())
                    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                        # One bad line must not cost the socket (and every
                        # pending command with it).
                        _LOGGER.warning(
                            "HEOS: skipping malformed line (%s): %r", exc, line[:120]
                        )
                        continue
                    if not isinstance(data, dict):
                        _LOGGER.warning("HEOS: skipping non-object line: %r", line[:120])
                        continue
                    _LOGGER.debug("HEOS RX: %s", data)

                    heos = data.get("heos", {})
                    cmd = heos.get("command", "")
                    msg = heos.get("message", "")

                    # Unsolicited events — always namespaced `event/...`.
                    # A substring test also matches the *response* to
                    # system/register_for_change_events ("...change_events"), which
                    # dispatched it to the callbacks instead of resolving its future
                    # and stalled every connect for the full 8s command timeout.
                    if cmd.startswith("event/"):
                        self._dispatch_event(data)
                        continue

                    # Ignore "command under process" intermediate responses
                    if "command under process" in msg:
                        continue

                    # Resolve pending commands
                    for i, (p_cmd, fut) in enumerate(self._pending_commands):
                        if cmd == p_cmd and not fut.done():
                            fut.set_result(data)
                            self._pending_commands.pop(i)
                            break

                except ValueError as exc:
                    # readline() limit overrun: the stream is out of sync.
                    _LOGGER.warning("HEOS buffer limit exceeded (DoS prevention): %s", exc)
                    break
        except asyncio.CancelledError:
            # Cancelled by disconnect(), which owns the cleanup. Running it again
            # from here would cancel the task that called disconnect() (an event
            # callback reconnecting, say) half-way through its own teardown.
            raise
        except Exception as exc:
            _LOGGER.warning("HEOS listen error: %s", exc)
        # EOF or error: the socket is gone and nobody else knows yet.
        await self.disconnect()

    async def _command(
        self, cmd: str, params: str = "", timeout: float | None = None
    ) -> dict[str, Any] | None:
        """Send a HEOS command and wait for parsed JSON response via the event loop.

        Bounded in every branch: reconnect is single-flight via
        `ensure_connected()`, the write lock is acquired with `timeout`, and the
        reply is awaited with `timeout`. Until 2026-10 the reconnect ran *under*
        `_lock`, and `connect()` issues its own commands through here, so the
        first command after a socket drop waited on the lock it already held,
        forever.
        """
        if timeout is None:
            timeout = self.command_timeout
        if not self.connected:
            if asyncio.current_task() is self._connecting_task:
                # Handshake command after the fresh socket dropped again; the
                # outer connect() reports the failure.
                return None
            _LOGGER.info("HEOS reconnecting before command %s", cmd)
            if not await self.ensure_connected():
                return None

        self._lock_waiters += 1
        try:
            await asyncio.wait_for(self._lock.acquire(), timeout)
        except TimeoutError:
            _LOGGER.warning("HEOS command lock wait timed out (%.1fs): %s", timeout, cmd)
            return None
        finally:
            self._lock_waiters -= 1

        try:
            if not self.connected or self._writer is None:
                return None  # dropped while we waited for the lock
            url = f"heos://{cmd}"
            if params:
                url += f"?{params}"

            fut = asyncio.get_running_loop().create_future()
            self._pending_commands.append((cmd, fut))

            _LOGGER.debug("HEOS TX: %s", url)
            self._writer.write(f"{url}\r\n".encode())
            await self._writer.drain()
        except Exception as exc:
            _LOGGER.warning("HEOS command send error (%s): %s", cmd, exc)
            await self.disconnect()
            return None
        finally:
            self._lock.release()

        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except TimeoutError:
            _LOGGER.warning("HEOS command timeout: %s", cmd)
            self._pending_commands = [(c, f) for c, f in self._pending_commands if f != fut]
            return None

    async def _reconnect(self) -> None:
        await self.disconnect()
        await self.connect()

    def _pid_param(self) -> str:
        return f"pid={self._pid}" if self._pid else ""

    async def play(self) -> bool:
        return _ok(await self._command("player/set_play_state", f"{self._pid_param()}&state=play"))

    async def pause(self) -> bool:
        return _ok(await self._command("player/set_play_state", f"{self._pid_param()}&state=pause"))

    async def stop(self) -> bool:
        return _ok(await self._command("player/set_play_state", f"{self._pid_param()}&state=stop"))

    async def next_track(self) -> bool:
        return _ok(await self._command("player/play_next", self._pid_param()))

    async def previous_track(self) -> bool:
        return _ok(await self._command("player/play_previous", self._pid_param()))

    async def get_play_state(self) -> str | None:
        """Return 'play', 'pause', 'stop', or None."""
        resp = await self._command("player/get_play_state", self._pid_param())
        if resp:
            return parse_heos_message(resp.get("heos", {}).get("message", "")).get("state")
        return None

    async def get_now_playing(self) -> dict[str, Any] | None:
        """Return now-playing info."""
        resp = await self._command("player/get_now_playing_media", self._pid_param())
        if resp and "payload" in resp:
            return resp["payload"]
        return None

    async def get_music_sources(self) -> list[dict[str, Any]]:
        """Return available HEOS music sources (streaming services)."""
        resp = await self._command("browse/get_music_sources")
        if resp and "payload" in resp:
            return resp["payload"]
        return []

    async def check_account(self) -> dict[str, Any]:
        """Check HEOS account sign-in state.

        Returns {'signed_in': bool, 'username': str|None, 'reachable': bool}.
        A signed-out receiver makes every cloud source (TuneIn, Tidal, …)
        unavailable, so radio browse silently returns nothing. ``reachable``
        is False when the command itself timed out / errored.
        """
        resp = await self._command("system/check_account", timeout=5.0)
        if not resp:
            return {"signed_in": False, "username": None, "reachable": False}
        msg = resp.get("heos", {}).get("message", "")
        if msg.startswith("signed_in"):
            username = parse_heos_message(msg).get("un")
            return {"signed_in": True, "username": username, "reachable": True}
        return {"signed_in": False, "username": None, "reachable": True}

    async def is_source_available(self, sid: int) -> bool | None:
        """Whether a music source (by sid) is currently available.

        None when the source list couldn't be fetched (receiver unreachable).
        """
        sources = await self.get_music_sources()
        if not sources:
            return None
        for s in sources:
            if s.get("sid") == sid:
                return str(s.get("available", "")).lower() == "true"
        return False

    async def browse_source(self, sid: int, cid: str | None = None) -> dict[str, Any]:
        """Browse a HEOS music source. Returns {items, count, returned}."""
        empty = {"items": [], "count": 0, "returned": 0}

        # Prevent HEOS command injection via cid parameter
        if cid and not _safe_param(cid, 1000):
            _LOGGER.warning("Invalid cid rejected (injection or length)")
            return {**empty, "_debug": "invalid_cid"}

        params = f"sid={sid}"
        if cid:
            params += f"&cid={cid}"

        resp = await self._command("browse/browse", params, timeout=10.0)

        if not resp:
            return {**empty, "_debug": "timeout_or_error"}

        if resp.get("heos", {}).get("result") == "fail":
            _LOGGER.warning("HEOS browse failed: %s", resp.get("heos", {}).get("message"))
            return {**empty, "_debug": "fail"}

        # Parse count from message string
        fields = parse_heos_message(resp.get("heos", {}).get("message", ""))
        count = _to_int(fields.get("count"))
        returned = _to_int(fields.get("returned"))

        items = resp.get("payload") or []
        result = {"items": items, "count": count, "returned": returned}

        if not items:
            result["_debug"] = "no_items"
            safe_cid = (cid or "None").replace('\n', '\\n').replace('\r', '\\r')[:80]
            _LOGGER.warning("HEOS browse returned 0 items for cid=%s", safe_cid)

        return result

    async def play_stream(self, sid: int, mid: str) -> bool:
        """Play a stream directly (e.g., a TuneIn radio station)."""
        if not self._pid:
            return False

        # Prevent HEOS command injection via mid parameter
        if not _safe_param(mid, 500):
            _LOGGER.warning("Invalid mid rejected (injection or length)")
            return False

        return _ok(await self._command(
            "browse/play_stream", f"pid={self._pid}&sid={sid}&mid={mid}"
        ))

