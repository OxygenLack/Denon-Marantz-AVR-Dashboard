"""HeosClient against a fake HEOS CLI server on 127.0.0.1.

Regression cover for the reentrant-lock deadlock: `_command()` held `_lock`
while reconnecting, and `connect()` issues commands through `_command()`, so the
first command after a socket drop waited on the lock it already held, forever.
Reproduced on 2026-10-23: `play()` never returned after the receiver closed the
HEOS socket.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon.heos_client import HeosClient

PID = 42


class FakeHeosServer:
    """Minimal HEOS CLI: answers get_players / register_for_change_events / everything."""

    def __init__(self) -> None:
        self.port = 0
        self.connections = 0
        self.commands: list[str] = []
        self.silent: set[str] = set()  # commands that get no reply
        self._server: asyncio.Server | None = None
        self._writers: list[asyncio.StreamWriter] = []

    async def start(self) -> None:
        self._server = await asyncio.start_server(self._handle, "127.0.0.1", 0)
        self.port = self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        await self.drop_clients()
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def drop_clients(self) -> None:
        for w in self._writers:
            w.close()
        for w in self._writers:
            try:
                await w.wait_closed()
            except Exception:
                pass
        self._writers.clear()

    async def send_event(self, command: str, message: str) -> None:
        line = json.dumps({"heos": {"command": command, "message": message}}) + "\r\n"
        for w in self._writers:
            w.write(line.encode())
            await w.drain()

    async def send_raw(self, data: bytes) -> None:
        for w in self._writers:
            w.write(data)
            await w.drain()

    def _response(self, cmd: str) -> dict:
        if cmd == "player/get_players":
            return {
                "heos": {"command": cmd, "result": "success", "message": ""},
                "payload": [{"name": "Fake", "pid": PID}],
            }
        if cmd == "player/get_play_state":
            return {"heos": {"command": cmd, "result": "success", "message": f"pid={PID}&state=play"}}
        return {"heos": {"command": cmd, "result": "success", "message": f"pid={PID}"}}

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.connections += 1
        self._writers.append(writer)
        try:
            while True:
                line = await reader.readline()
                if not line:
                    break
                url = line.decode().strip()
                cmd = url.removeprefix("heos://").split("?", 1)[0]
                self.commands.append(cmd)
                if cmd in self.silent:
                    continue
                writer.write((json.dumps(self._response(cmd)) + "\r\n").encode())
                await writer.drain()
        except (ConnectionError, asyncio.CancelledError):
            pass
        finally:
            writer.close()


async def _wait_until(pred, timeout: float = 3.0) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if pred():
            return True
        await asyncio.sleep(0.005)
    return pred()


@pytest.fixture
async def server():
    srv = FakeHeosServer()
    await srv.start()
    yield srv
    await srv.stop()


@pytest.fixture
async def client(server):
    c = HeosClient("127.0.0.1", server.port)
    c.command_timeout = 1.0
    yield c
    await c.disconnect()


async def test_connect_discovers_pid(server, client):
    await client.connect()
    assert client.connected
    assert client.player_id == PID
    assert server.commands[:2] == ["player/get_players", "system/register_for_change_events"]


async def test_play_after_socket_drop_reconnects_and_succeeds(server, client):
    """The deadlock regression: must finish within 3 s, not hang forever."""
    await client.connect()
    await server.drop_clients()
    assert await _wait_until(lambda: not client.connected), "reader did not notice the drop"

    ok = await asyncio.wait_for(client.play(), timeout=3)

    assert ok is True
    assert server.connections == 2
    assert client.connected
    assert client.lock_waiters == 0
    assert client.pending_count == 0


async def test_unanswered_command_returns_false_within_timeout(server, client):
    server.silent.add("player/set_play_state")
    await client.connect()

    ok = await asyncio.wait_for(client.play(), timeout=client.command_timeout + 1)

    assert ok is False
    assert client.lock_waiters == 0
    assert client.pending_count == 0  # pruned on timeout


async def test_second_command_times_out_on_lock_wait_instead_of_hanging(server, client):
    await client.connect()
    await client._lock.acquire()  # stand in for a command stuck in write/drain
    try:
        task = asyncio.create_task(client._command("player/get_play_state", timeout=0.3))
        assert await _wait_until(lambda: client.lock_waiters == 1, timeout=1)
        resp = await asyncio.wait_for(task, timeout=2)
    finally:
        client._lock.release()

    assert resp is None
    assert client.lock_waiters == 0


async def test_concurrent_commands_while_disconnected_trigger_one_reconnect(server, client):
    await client.connect()
    await server.drop_clients()
    assert await _wait_until(lambda: not client.connected)

    results = await asyncio.wait_for(asyncio.gather(client.play(), client.pause()), timeout=5)

    assert results == [True, True]
    assert server.connections == 2
    assert server.commands.count("player/get_players") == 2


async def test_event_callback_issuing_a_command_does_not_stall_listen(server, client):
    seen: asyncio.Future = asyncio.get_running_loop().create_future()

    async def on_event(_data: dict) -> None:
        state = await client.get_play_state()
        if not seen.done():
            seen.set_result(state)

    client.on_event(on_event)
    await client.connect()

    await server.send_event("event/player_state_changed", f"pid={PID}&state=play")

    assert await asyncio.wait_for(seen, timeout=2) == "play"
    assert client.connected
    await _wait_until(lambda: client.callback_task_count == 0, timeout=1)
    assert client.callback_task_count == 0


async def test_disconnect_from_a_callback_does_not_cancel_itself(server, client):
    done = asyncio.get_running_loop().create_future()

    async def on_event(_data: dict) -> None:
        await client.disconnect()
        await asyncio.sleep(0)  # would raise CancelledError if we were cancelled
        if not done.done():
            done.set_result(True)

    client.on_event(on_event)
    await client.connect()
    await server.send_event("event/player_state_changed", f"pid={PID}&state=stop")

    assert await asyncio.wait_for(done, timeout=2) is True
    assert not client.connected


async def test_socket_drop_mid_command_returns_none_instead_of_cancelling_caller(server, client):
    """A drop while a reply is outstanding must not raise CancelledError in the caller."""
    server.silent.add("player/get_now_playing_media")
    await client.connect()

    task = asyncio.create_task(client.get_now_playing())
    await _wait_until(lambda: client.pending_count == 1)
    await server.drop_clients()

    assert await asyncio.wait_for(task, timeout=2) is None
    assert not task.cancelled()


async def test_malformed_line_is_skipped_and_socket_stays_up(server, client, caplog):
    seen: asyncio.Future = asyncio.get_running_loop().create_future()

    async def on_event(data: dict) -> None:
        if not seen.done():
            seen.set_result(data["heos"]["command"])

    client.on_event(on_event)
    await client.connect()

    with caplog.at_level("WARNING", logger="denon.heos_client"):
        await server.send_raw(b"not json\r\n")
        await server.send_event("event/player_state_changed", f"pid={PID}&state=play")
        assert await asyncio.wait_for(seen, timeout=2) == "event/player_state_changed"

    assert client.connected
    assert server.connections == 1
    assert any("skipping malformed line" in r.message for r in caplog.records)


async def test_connect_without_player_is_a_failure(server, client):
    server.silent.add("player/get_players")
    await client.connect()
    assert client.connected is False
    assert client.player_id is None


async def test_connect_failure_warning_is_throttled(caplog):
    import socket

    with socket.socket() as s:  # grab a free port, then close it
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    c = HeosClient("127.0.0.1", port)
    with caplog.at_level("DEBUG", logger="denon.heos_client"):
        for _ in range(25):
            await c.connect()
    warnings = [
        r for r in caplog.records
        if r.levelname == "WARNING" and "HEOS connection failed" in r.message
    ]
    assert len(warnings) == 2  # attempt 1 and attempt 20
    assert c._connect_failures == 25


async def test_reconnect_after_failures_logs_recovery(server, client, caplog):
    client._connect_failures = 3
    with caplog.at_level("INFO", logger="denon.heos_client"):
        await client.connect()
    assert client.connected
    assert client._connect_failures == 0
    assert any("up again after 4 attempt(s)" in r.message for r in caplog.records)
