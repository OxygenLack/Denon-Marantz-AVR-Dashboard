"""Radio preload supervision (radio_service): single-flight, status, backoff."""
from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["DENON_DASHBOARD_DENON_HOST"] = ""
os.environ["DENON_DASHBOARD_LOG_LEVEL"] = "WARNING"

import radio_service
from state import app_state


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
async def radio(monkeypatch):
    """Fresh radio_service state, no preload delay, controllable clock."""
    clock = FakeClock()
    monkeypatch.setattr(radio_service, "_clock", clock)
    monkeypatch.setattr(radio_service, "PRELOAD_DELAY", 0.0)
    radio_service.reset()
    radio_service._preload_task = None
    radio_service._rerun_requested = False
    yield clock
    await radio_service.cancel_preload()
    radio_service.reset()
    radio_service._rerun_requested = False
    app_state.heos = None


def _heos(connected: bool = True) -> MagicMock:
    heos = MagicMock()
    heos.connected = connected
    heos.check_account = AsyncMock(return_value={"signed_in": True, "username": "u", "reachable": True})
    heos.is_source_available = AsyncMock(return_value=True)
    heos.browse_source = AsyncMock(return_value={"items": [], "count": 0, "returned": 0})
    return heos


async def test_concurrent_refresh_starts_exactly_one_preload(radio, monkeypatch):
    from main import app

    app_state.heos = _heos()
    started = 0
    release = asyncio.Event()

    async def fake_preload() -> None:
        nonlocal started
        started += 1
        await release.wait()

    monkeypatch.setattr(radio_service, "preload_radio_stations", fake_preload)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resps = await asyncio.gather(*(ac.post("/api/v1/media/radio/refresh") for _ in range(5)))
    assert all(r.status_code == 200 for r in resps)
    assert sum(1 for r in resps if r.json()["started"]) == 1
    assert started == 1
    assert radio_service.is_preloading()

    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


async def test_radio_status_reports_preloading(radio, monkeypatch):
    from main import app

    app_state.heos = _heos()
    release = asyncio.Event()

    async def fake_preload() -> None:
        await release.wait()

    monkeypatch.setattr(radio_service, "preload_radio_stations", fake_preload)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        before = (await ac.get("/api/v1/media/radio/status")).json()
        assert radio_service.ensure_radio_preload() is True
        during = (await ac.get("/api/v1/media/radio/status")).json()
        release.set()
        await asyncio.sleep(0.01)
        after = (await ac.get("/api/v1/media/radio/status")).json()

    assert before["preloading"] is False
    assert during["preloading"] is True
    assert after["preloading"] is False


async def test_skipped_preload_retries_after_backoff(radio):
    clock = radio
    app_state.heos = _heos(connected=False)

    assert radio_service.ensure_radio_preload() is True
    await radio_service._preload_task
    assert radio_service.preload_done() is False
    assert radio_service._attempts == 1

    # Inside the 60 s backoff: nothing starts.
    clock.now += 30
    assert radio_service.ensure_radio_preload() is False
    assert radio_service.is_preloading() is False

    # Backoff elapsed: the retry runs, fails again, backs off to 120 s.
    clock.now += 31
    assert radio_service.ensure_radio_preload() is True
    await radio_service._preload_task
    assert radio_service._attempts == 2
    assert radio_service._next_attempt_at == pytest.approx(clock.now + 120)


async def test_refresh_resets_backoff(radio):
    app_state.heos = _heos(connected=False)
    assert radio_service.ensure_radio_preload() is True
    await radio_service._preload_task
    assert radio_service.ensure_radio_preload() is False  # backing off

    radio_service.reset()
    assert radio_service.ensure_radio_preload() is True
    await radio_service._preload_task


async def test_successful_preload_marks_done(radio):
    heos = _heos()
    station = {"name": "Radio X", "mid": "s1", "playable": "yes"}
    heos.browse_source = AsyncMock(side_effect=[
        {"items": [{"name": "Local Radio", "cid": "c1"}], "count": 1, "returned": 1},
        {"items": [station], "count": 1, "returned": 1},
    ])
    app_state.heos = heos

    assert radio_service.ensure_radio_preload() is True
    await radio_service._preload_task

    assert radio_service.preload_done() is True
    assert radio_service.cached_station_count() == 1
    assert radio_service.ensure_radio_preload() is False
    assert radio_service.search_stations("radio") == [station]
