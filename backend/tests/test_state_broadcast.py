"""AppState.broadcast_state: ordered snapshots, concurrent sends, slow-client drop."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import state as state_mod
from state import AppState


class FakeWs:
    def __init__(self, delay: float = 0.0) -> None:
        self.delay = delay
        self.received: list[dict] = []

    async def send_text(self, msg: str) -> None:
        if self.delay:
            await asyncio.sleep(self.delay)
        self.received.append(json.loads(msg))


@pytest.fixture
def app() -> AppState:
    a = AppState()
    telnet = MagicMock()
    telnet.connected = True
    telnet.state = {"volume": 0}
    a.telnet = telnet
    return a


async def test_overlapping_broadcasts_arrive_in_call_order(app):
    ws = FakeWs(delay=0.05)
    app.ws_clients.add(ws)

    app.telnet.state["volume"] = 1
    first = asyncio.create_task(app.broadcast_state(force=True))
    await asyncio.sleep(0)  # first enters the lock and snapshots volume=1
    app.telnet.state["volume"] = 2
    second = asyncio.create_task(app.broadcast_state(force=True))
    await asyncio.gather(first, second)

    assert [m["volume"] for m in ws.received] == [1, 2]


async def test_hanging_client_is_dropped_without_delaying_others(app, monkeypatch):
    monkeypatch.setattr(state_mod, "WS_SEND_TIMEOUT", 0.2)
    fast = FakeWs()
    stuck = FakeWs(delay=10)
    app.ws_clients.update({fast, stuck})

    task = asyncio.create_task(app.broadcast_state(force=True))
    await asyncio.sleep(0.05)
    assert len(fast.received) == 1, "fast client waited on the stuck one"

    await asyncio.wait_for(task, timeout=1)
    assert stuck not in app.ws_clients
    assert fast in app.ws_clients


async def test_unchanged_state_is_not_rebroadcast(app):
    ws = FakeWs()
    app.ws_clients.add(ws)
    await app.broadcast_state()
    await app.broadcast_state()
    assert len(ws.received) == 1
    await app.broadcast_state(force=True)
    assert len(ws.received) == 2


def _real_client_app(telnet_client) -> AppState:
    """AppState wired to a real parser. No on_state_change callback is
    registered, so `_mark_dirty` is a no-op and the test drives the
    broadcasts itself (deterministic frame counts)."""
    a = AppState()
    a.telnet = telnet_client
    return a


async def test_channel_volume_change_is_broadcast(telnet_client):
    app = _real_client_app(telnet_client)
    ws = FakeWs()
    app.ws_clients.add(ws)

    await telnet_client._parse("CVFL 50")
    await app.broadcast_state()
    assert len(ws.received) == 1

    # In-place mutation of the shared channel_volumes dict: the old dict-based
    # dedupe compared the dict with itself and swallowed this frame.
    await telnet_client._parse("CVFL 55")
    await app.broadcast_state()
    assert len(ws.received) == 2
    assert ws.received[-1]["channel_volumes"] == {"FL": 55}


async def test_mvmax_alone_is_broadcast(telnet_client):
    app = _real_client_app(telnet_client)
    ws = FakeWs()
    app.ws_clients.add(ws)

    await telnet_client._parse("MV50")
    await app.broadcast_state()
    assert len(ws.received) == 1

    await telnet_client._parse("MVMAX 85")
    await app.broadcast_state()
    assert len(ws.received) == 2
    assert ws.received[-1]["volume_max"] == 85.0


def _patch_connect_io(monkeypatch, telnet_delay: float = 0.3):
    """Fake out every network call connect_to_host makes."""
    import calibration
    import radio_service
    from denon.heos_client import HeosClient
    from denon.telnet_client import DenonTelnetClient

    calls = {"telnet": 0, "active": 0, "max_active": 0}

    async def slow_connect(self) -> None:
        calls["telnet"] += 1
        calls["active"] += 1
        calls["max_active"] = max(calls["max_active"], calls["active"])
        try:
            await asyncio.sleep(telnet_delay)
        finally:
            calls["active"] -= 1
        raise ConnectionError("fake receiver is off")  # keeps the supervisor quiet-ish

    async def noop(*_a, **_kw) -> None:
        return None

    async def no_calibration(_host: str) -> dict:
        return {}

    monkeypatch.setattr(DenonTelnetClient, "connect", slow_connect)
    monkeypatch.setattr(DenonTelnetClient, "start", lambda self: None)
    monkeypatch.setattr(HeosClient, "connect", noop)
    monkeypatch.setattr(calibration, "fetch_speaker_calibration", no_calibration)
    monkeypatch.setattr(radio_service, "ensure_radio_preload", lambda: False)
    return calls


async def test_connect_to_host_does_not_hold_state_lock_during_io(monkeypatch):
    _patch_connect_io(monkeypatch)
    app = AppState()
    task = asyncio.create_task(app.connect_to_host("192.168.1.50"))
    try:
        await asyncio.sleep(0.05)  # connect is now inside the slow telnet connect
        assert not task.done()
        await asyncio.wait_for(app._lock.acquire(), timeout=0.05)
        app._lock.release()
        # The new clients are visible before the initial poll finished.
        assert app.telnet is not None and app.telnet.host == "192.168.1.50"
        assert app.receiver_host == "192.168.1.50"
        await task
    finally:
        if not task.done():
            task.cancel()
        if app.telnet:
            await app.telnet.disconnect()
        if app.heos:
            await app.heos.disconnect()


async def test_concurrent_connects_are_serialised(monkeypatch):
    calls = _patch_connect_io(monkeypatch, telnet_delay=0.1)
    app = AppState()
    try:
        await asyncio.gather(
            app.connect_to_host("192.168.1.50"),
            app.connect_to_host("192.168.1.51"),
        )
        assert calls["telnet"] == 2
        assert calls["max_active"] == 1
        assert app.telnet.host == "192.168.1.51"
        assert app.receiver_host == "192.168.1.51"
    finally:
        if app.telnet:
            await app.telnet.disconnect()
        if app.heos:
            await app.heos.disconnect()
