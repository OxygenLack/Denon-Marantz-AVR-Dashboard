"""Async HEOS CLI client for media transport controls."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Coroutine

_LOGGER = logging.getLogger("denon.heos_client")

HEOS_PORT = 1255


class HeosClient:
    """Lightweight HEOS CLI client (port 1255) for media control."""

    def __init__(self, host: str, port: int = HEOS_PORT):
        self._host = host
        self._port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._lock = asyncio.Lock()
        self._pid: int | None = None
        self._listen_task: asyncio.Task | None = None
        self._pending_commands: list[tuple[str, asyncio.Future]] = []
        self._callbacks: list[Callable[[dict[str, Any]], Coroutine]] = []

    def on_event(self, cb: Callable[[dict[str, Any]], Coroutine]) -> None:
        """Register a callback for unsolicited HEOS events."""
        self._callbacks.append(cb)

    async def connect(self) -> None:
        """Connect and discover player ID."""
        try:
            # Use limit=102400 to prevent DoS from excessively long lines
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self._host, self._port, limit=102400), timeout=5
            )
            _LOGGER.info("HEOS connected to %s:%s", self._host, self._port)
            
            # Start background reader
            self._listen_task = asyncio.create_task(self._listen())
            
            # Discover player
            resp = await self._command("player/get_players")
            if resp and "payload" in resp:
                for p in resp["payload"]:
                    self._pid = p.get("pid")
                    _LOGGER.info("HEOS player: %s (pid=%s)", p.get("name"), self._pid)
                    break
                    
            # Enable change events
            await self._command("system/register_for_change_events", "enable=on")
        except Exception as exc:
            _LOGGER.warning("HEOS connection failed: %s", exc)
            await self.disconnect()

    async def disconnect(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None
            
        for _, fut in self._pending_commands:
            if not fut.done():
                fut.cancel()
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

    async def _listen(self) -> None:
        """Background task to read HEOS stream."""
        try:
            while self.connected and self._reader:
                try:
                    line = await self._reader.readline()
                    if not line:
                        break
                    
                    data = json.loads(line.decode().strip())
                    _LOGGER.debug("HEOS RX: %s", data)
                    
                    heos = data.get("heos", {})
                    cmd = heos.get("command", "")
                    msg = heos.get("message", "")
                    
                    # Unsolicited events
                    if "event" in cmd or cmd in ("player/state_changed", "player/now_playing_changed", "player/now_playing_progress"):
                        for cb in self._callbacks:
                            try:
                                await cb(data)
                            except Exception as exc:
                                _LOGGER.error("HEOS callback error: %s", exc)
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
                    _LOGGER.warning("HEOS buffer limit exceeded (DoS prevention): %s", exc)
                    break
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            _LOGGER.warning("HEOS listen error: %s", exc)
        finally:
            await self.disconnect()

    async def _command(self, cmd: str, params: str = "", timeout: float = 8.0) -> dict[str, Any] | None:
        """Send a HEOS command and wait for parsed JSON response via the event loop."""
        async with self._lock:
            if not self.connected:
                await self._reconnect()
                if not self.connected:
                    return None
                    
            try:
                url = f"heos://{cmd}"
                if params:
                    url += f"?{params}"
                    
                fut = asyncio.get_running_loop().create_future()
                self._pending_commands.append((cmd, fut))
                
                _LOGGER.debug("HEOS TX: %s", url)
                self._writer.write(f"{url}\\r\\n".encode())
                await self._writer.drain()
            except Exception as exc:
                _LOGGER.warning("HEOS command send error (%s): %s", cmd, exc)
                await self.disconnect()
                return None
                
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            _LOGGER.warning("HEOS command timeout: %s", cmd)
            self._pending_commands = [(c, f) for c, f in self._pending_commands if f != fut]
            return None

    async def _reconnect(self) -> None:
        await self.disconnect()
        await self.connect()

    def _pid_param(self) -> str:
        return f"pid={self._pid}" if self._pid else ""

    async def play(self) -> bool:
        resp = await self._command("player/set_play_state", f"{self._pid_param()}&state=play")
        return resp is not None and resp.get("heos", {}).get("result") == "success"

    async def pause(self) -> bool:
        resp = await self._command("player/set_play_state", f"{self._pid_param()}&state=pause")
        return resp is not None and resp.get("heos", {}).get("result") == "success"

    async def stop(self) -> bool:
        resp = await self._command("player/set_play_state", f"{self._pid_param()}&state=stop")
        return resp is not None and resp.get("heos", {}).get("result") == "success"

    async def next_track(self) -> bool:
        resp = await self._command("player/play_next", self._pid_param())
        return resp is not None and resp.get("heos", {}).get("result") == "success"

    async def previous_track(self) -> bool:
        resp = await self._command("player/play_previous", self._pid_param())
        return resp is not None and resp.get("heos", {}).get("result") == "success"

    async def get_play_state(self) -> str | None:
        """Return 'play', 'pause', 'stop', or None."""
        resp = await self._command("player/get_play_state", self._pid_param())
        if resp:
            msg = resp.get("heos", {}).get("message", "")
            for part in msg.split("&"):
                if part.startswith("state="):
                    return part[6:]
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

    async def browse_source(self, sid: int, cid: str | None = None) -> dict[str, Any]:
        """Browse a HEOS music source. Returns {items, count, returned}."""
        empty = {"items": [], "count": 0, "returned": 0}
        
        # Prevent HEOS command injection via cid parameter
        if cid and ('\\r' in cid or '\\n' in cid or len(cid) > 1000):
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
        msg = resp.get("heos", {}).get("message", "")
        count = 0
        returned = 0
        for part in msg.split("&"):
            if part.startswith("count="):
                try: count = int(part[6:])
                except ValueError: pass
            elif part.startswith("returned="):
                try: returned = int(part[9:])
                except ValueError: pass
                
        items = resp.get("payload") or []
        result = {"items": items, "count": count, "returned": returned}
        
        if not items:
            result["_debug"] = "no_items"
            safe_cid = (cid or "None").replace('\\n', '\\\\n').replace('\\r', '\\\\r')[:80]
            _LOGGER.warning("HEOS browse returned 0 items for cid=%s", safe_cid)
            
        return result

    async def play_stream(self, sid: int, mid: str) -> bool:
        """Play a stream directly (e.g., a TuneIn radio station)."""
        if not self._pid:
            return False
            
        # Prevent HEOS command injection via mid parameter
        if not mid or '\\r' in mid or '\\n' in mid or len(mid) > 500:
            _LOGGER.warning("Invalid mid rejected (injection or length)")
            return False
            
        resp = await self._command("browse/play_stream", f"pid={self._pid}&sid={sid}&mid={mid}")
        return resp is not None and resp.get("heos", {}).get("result") == "success"

