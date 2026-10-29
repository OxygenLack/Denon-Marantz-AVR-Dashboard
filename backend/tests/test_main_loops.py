"""Periodic background loops and the Night Mode scheduler guard."""
from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def test_run_periodic_survives_tick_error(caplog):
    import main

    calls = {"n": 0}
    two_ticks = asyncio.Event()

    async def tick() -> None:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        two_ticks.set()

    with caplog.at_level("WARNING", logger="denon_dashboard"):
        task = asyncio.create_task(main._run_periodic("Test loop", 0.01, tick))
        try:
            await asyncio.wait_for(two_ticks.wait(), timeout=2)
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    assert calls["n"] >= 2
    assert any("Test loop tick failed: boom" in r.message for r in caplog.records)


async def test_reconcile_skips_when_telnet_down(monkeypatch):
    import night_mode
    from state import app_state

    apply = AsyncMock()
    monkeypatch.setattr(night_mode, "apply_night_mode", apply)
    monkeypatch.setattr(night_mode, "is_schedule_active", lambda _cfg: True)
    app_state.night_mode_config = {
        "channels": [{"channel": "FL", "mode": "offset", "value": -4}],
    }
    telnet = MagicMock()
    telnet.connected = False
    monkeypatch.setattr(app_state, "telnet", telnet)

    await night_mode.reconcile_night_mode_schedule()
    apply.assert_not_awaited()

    telnet.connected = True
    await night_mode.reconcile_night_mode_schedule()
    apply.assert_awaited_once()
