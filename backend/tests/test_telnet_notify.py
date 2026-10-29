"""Telnet notification coalescing: parsing must never wait on a callback."""
from __future__ import annotations

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def test_burst_of_lines_collapses_into_few_callback_rounds(telnet_client):
    calls: list[float] = []

    async def cb(state):
        calls.append(state["volume"])

    telnet_client.on_state_change(cb)
    for i in range(100):
        await telnet_client._parse(f"MV{i % 98:02d}")
    await telnet_client.flush_notifications()

    assert len(calls) <= 2
    assert calls[-1] == telnet_client.state["volume"] == 99 % 98


async def test_slow_callback_does_not_delay_parsing(telnet_client):
    entered = asyncio.Event()

    async def slow_cb(_state):
        entered.set()
        await asyncio.sleep(3)

    telnet_client.on_state_change(slow_cb)
    await telnet_client._parse("MV40")
    await asyncio.wait_for(entered.wait(), timeout=1)

    t0 = time.monotonic()
    await telnet_client._parse("MV41")
    assert time.monotonic() - t0 < 0.1
    assert telnet_client.state["volume"] == 41

    await telnet_client.disconnect()  # cancels the broadcaster mid-sleep
    assert telnet_client._broadcaster is None


async def test_callback_exception_is_logged_not_propagated(telnet_client, caplog):
    seen = []

    async def bad_cb(_state):
        raise RuntimeError("boom")

    async def good_cb(state):
        seen.append(state["volume"])

    telnet_client.on_state_change(bad_cb)
    telnet_client.on_state_change(good_cb)
    with caplog.at_level("ERROR", logger="denon.telnet_client"):
        await telnet_client._parse("MV42")
        await telnet_client.flush_notifications()

    assert seen == [42]
    assert any("Callback error" in r.message for r in caplog.records)


async def test_no_broadcaster_without_callbacks(telnet_client):
    await telnet_client._parse("MV43")
    assert telnet_client._broadcaster is None
    assert telnet_client.state["volume"] == 43
