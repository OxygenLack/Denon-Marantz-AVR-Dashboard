"""Tests for the telnet connection supervisor.

Regression cover for the 2026-09-04 -> 2026-09-07 outage: the receiver was in
standby when the container started, the one-shot `connect()` raised, and nothing
ever retried it. The dashboard sat at `connected: false` for ~29 h while its
Docker healthcheck stayed green.
"""
from __future__ import annotations

import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon import telnet_client as tc_mod
from denon.telnet_client import DenonTelnetClient


class _FakeWriter:
    def __init__(self) -> None:
        self.closed = False

    def write(self, data: bytes) -> None:
        pass

    async def drain(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        pass


class _FakeReader:
    """Reader that blocks forever, or returns EOF once `eof` is set."""

    def __init__(self, eof: asyncio.Event | None = None) -> None:
        self._eof = eof

    async def read(self, n: int) -> bytes:
        if self._eof is not None:
            await self._eof.wait()
            return b""
        await asyncio.sleep(3600)
        return b""


async def _noop_poll(self) -> None:
    """Skip the 25-command startup poll (~2 s of sleeps) in tests."""


@pytest.fixture
def fast_supervisor(monkeypatch):
    """Collapse the real backoff (10 s -> 300 s) into milliseconds."""
    monkeypatch.setattr(tc_mod, "TELNET_RECONNECT_DELAY", 0.01)
    monkeypatch.setattr(tc_mod, "TELNET_RECONNECT_MAX_DELAY", 0.02)
    monkeypatch.setattr(tc_mod, "TELNET_SUPERVISOR_INTERVAL", 0.01)
    monkeypatch.setattr(DenonTelnetClient, "_poll_status", _noop_poll)


async def _wait_until(pred, timeout: float = 3.0) -> bool:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if pred():
            return True
        await asyncio.sleep(0.005)
    return pred()


@pytest.mark.asyncio
async def test_supervisor_recovers_when_the_first_connect_fails(monkeypatch, fast_supervisor):
    """The regression: AVR in standby at startup must not mean 'dead forever'."""
    calls = {"n": 0}

    async def fake_open(host, port, **kwargs):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise ConnectionRefusedError("AVR in standby")
        return _FakeReader(), _FakeWriter()

    monkeypatch.setattr(asyncio, "open_connection", fake_open)

    client = DenonTelnetClient("192.0.2.10", 23)
    client.start()
    try:
        assert await _wait_until(lambda: client.connected), "supervisor never connected"
        assert calls["n"] >= 3
        assert client.link_status["last_error"] is None
    finally:
        await client.disconnect()


@pytest.mark.asyncio
async def test_supervisor_reconnects_after_the_link_drops(monkeypatch, fast_supervisor):
    """A receiver going to standby closes the socket; the link must come back."""
    eof = asyncio.Event()
    opened: list[_FakeWriter] = []

    async def fake_open(host, port, **kwargs):
        writer = _FakeWriter()
        opened.append(writer)
        # only the first socket is droppable, later ones stay up
        return (_FakeReader(eof) if len(opened) == 1 else _FakeReader()), writer

    monkeypatch.setattr(asyncio, "open_connection", fake_open)

    client = DenonTelnetClient("192.0.2.10", 23)
    client.start()
    try:
        assert await _wait_until(lambda: client.connected)
        assert len(opened) == 1

        eof.set()  # receiver drops the connection
        assert await _wait_until(lambda: len(opened) >= 2), "no reconnect attempted"
        assert await _wait_until(lambda: client.connected), "link did not come back"
        # the dropped socket must not be leaked
        assert opened[0].closed is True
    finally:
        await client.disconnect()


@pytest.mark.asyncio
async def test_start_is_idempotent(monkeypatch, fast_supervisor):
    async def fake_open(host, port, **kwargs):
        return _FakeReader(), _FakeWriter()

    monkeypatch.setattr(asyncio, "open_connection", fake_open)

    client = DenonTelnetClient("192.0.2.10", 23)
    client.start()
    first = client._supervisor_task
    client.start()
    try:
        assert client._supervisor_task is first
    finally:
        await client.disconnect()


@pytest.mark.asyncio
async def test_disconnect_stops_the_supervisor(monkeypatch, fast_supervisor):
    """Shutdown must not leave a task reconnecting to a receiver nobody wants."""
    calls = {"n": 0}

    async def fake_open(host, port, **kwargs):
        calls["n"] += 1
        return _FakeReader(), _FakeWriter()

    monkeypatch.setattr(asyncio, "open_connection", fake_open)

    client = DenonTelnetClient("192.0.2.10", 23)
    client.start()
    assert await _wait_until(lambda: client.connected)

    await client.disconnect()
    assert client._supervisor_task is None
    assert client.connected is False

    before = calls["n"]
    await asyncio.sleep(0.1)
    assert calls["n"] == before, "supervisor kept reconnecting after disconnect()"


@pytest.mark.asyncio
async def test_handle_disconnect_is_idempotent(telnet_client):
    """Two drop notifications must not double-notify or reset the flag twice."""
    seen: list[dict] = []

    async def _cb(state):
        seen.append(state)

    telnet_client.on_state_change(_cb)
    await telnet_client._handle_disconnect()
    await telnet_client._handle_disconnect()
    await telnet_client.flush_notifications()

    assert telnet_client.connected is False
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_link_status_reports_the_failure(monkeypatch, fast_supervisor):
    """`link_status` has to say *why* the link is down, not just that it is."""

    async def fake_open(host, port, **kwargs):
        raise OSError("no route to host")

    monkeypatch.setattr(asyncio, "open_connection", fake_open)

    client = DenonTelnetClient("192.0.2.10", 23)
    client.start()
    try:
        assert await _wait_until(lambda: client.link_status["reconnect_attempts"] >= 2)
        status = client.link_status
        assert status["connected"] is False
        assert status["supervised"] is True
        assert "no route to host" in (status["last_error"] or "")
    finally:
        await client.disconnect()


@pytest.mark.asyncio
async def test_concurrent_sends_keep_command_interval(telnet_client):
    """Two concurrent senders must not interleave inside the 50 ms gap."""
    import time

    stamps: list[float] = []
    telnet_client._writer.write = lambda data: stamps.append(time.monotonic())

    results = await asyncio.gather(telnet_client.send("MV50"), telnet_client.send("MV51"))
    assert results == [True, True]
    assert len(stamps) == 2
    # small tolerance for timer granularity
    assert stamps[1] - stamps[0] >= tc_mod.COMMAND_INTERVAL * 0.9


@pytest.mark.asyncio
async def test_connect_raises_when_poll_loses_link(monkeypatch):
    async def fake_open(host, port, **kwargs):
        return _FakeReader(), _FakeWriter()

    async def dropping_poll(self) -> None:
        await self._handle_disconnect()

    monkeypatch.setattr(asyncio, "open_connection", fake_open)
    monkeypatch.setattr(DenonTelnetClient, "_poll_status", dropping_poll)

    client = DenonTelnetClient("192.0.2.10", 23)
    try:
        with pytest.raises(ConnectionError):
            await client.connect()
        assert client.connected is False
    finally:
        await client.disconnect()


@pytest.mark.asyncio
async def test_cancel_propagates_callers_cancellation(telnet_client):
    """`_cancel()` must not swallow a cancellation aimed at its caller."""

    async def stubborn() -> None:
        # Takes a moment to finish after its cancel, so the caller's own
        # cancellation arrives while _cancel() is still awaiting it.
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            await asyncio.sleep(0.05)
            raise

    inner = asyncio.create_task(stubborn())
    await asyncio.sleep(0)
    outer = asyncio.create_task(telnet_client._cancel(inner))
    await asyncio.sleep(0.01)
    outer.cancel()
    with pytest.raises(asyncio.CancelledError):
        await outer
