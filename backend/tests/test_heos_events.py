"""Tests for HEOS unsolicited-event handling.

Regression guard for the 2026-08-09 bug: `_on_heos_event` matched the *response*
command names (`player/state_changed`) instead of the event names the receiver
actually sends (`event/player_state_changed`), so every change event was dropped
and now_playing/play_state stayed frozen at their connect-time values.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon.heos_message import parse_heos_message
from state import AppState

PID = -959615296


@pytest.fixture
def state() -> AppState:
    """AppState with a stubbed, connected HEOS client and no WebSocket clients."""
    app = AppState()
    heos = AsyncMock()
    heos.connected = True
    heos.player_id = PID
    app.heos = heos
    return app


def testparse_heos_message() -> None:
    assert parse_heos_message(f"pid={PID}&state=play") == {"pid": str(PID), "state": "play"}
    assert parse_heos_message("") == {}
    assert parse_heos_message("pid=1&flag") == {"pid": "1"}


@pytest.mark.asyncio
async def test_state_changed_event_updates_play_state(state: AppState) -> None:
    state.media_state["play_state"] = "stop"

    await state._on_heos_event(
        {"heos": {"command": "event/player_state_changed", "message": f"pid={PID}&state=play"}}
    )

    assert state.media_state["play_state"] == "play"


@pytest.mark.asyncio
async def test_now_playing_changed_event_fetches_track(state: AppState) -> None:
    track = {"song": "Sign of the Times", "artist": "Harry Styles"}
    state.heos.get_now_playing.return_value = track

    await state._on_heos_event(
        {"heos": {"command": "event/player_now_playing_changed", "message": f"pid={PID}"}}
    )

    assert state.media_state["now_playing"] == track


@pytest.mark.asyncio
async def test_now_playing_timeout_keeps_previous_value(state: AppState) -> None:
    track = {"song": "Ms. Jackson", "artist": "Outkast"}
    state.media_state["now_playing"] = track
    state.heos.get_now_playing.return_value = None  # command timed out
    state.broadcast_state = AsyncMock()

    await state._on_heos_event(
        {"heos": {"command": "event/player_now_playing_changed", "message": f"pid={PID}"}}
    )

    assert state.media_state["now_playing"] == track
    state.broadcast_state.assert_not_awaited()


@pytest.mark.asyncio
async def test_event_for_other_player_is_ignored(state: AppState) -> None:
    state.media_state["play_state"] = "play"

    await state._on_heos_event(
        {"heos": {"command": "event/player_state_changed", "message": "pid=12345&state=stop"}}
    )

    assert state.media_state["play_state"] == "play"


@pytest.mark.asyncio
async def test_unrelated_event_leaves_state_alone(state: AppState) -> None:
    state.media_state["play_state"] = "play"

    await state._on_heos_event(
        {
            "heos": {
                "command": "event/player_now_playing_progress",
                "message": f"pid={PID}&cur_pos=101000&duration=340000",
            }
        }
    )

    assert state.media_state["play_state"] == "play"
    state.heos.get_now_playing.assert_not_awaited()


@pytest.mark.asyncio
async def test_refresh_media_state_reports_change(state: AppState) -> None:
    state.media_state["now_playing"] = {"song": "Ms. Jackson"}
    state.media_state["play_state"] = "stop"
    state.heos.get_now_playing.return_value = {"song": "Sign of the Times"}
    state.heos.get_play_state.return_value = "play"

    assert await state.refresh_media_state() is True
    assert state.media_state["now_playing"] == {"song": "Sign of the Times"}
    assert state.media_state["play_state"] == "play"

    # Second call sees identical values -> no broadcast-worthy change.
    assert await state.refresh_media_state() is False


@pytest.mark.asyncio
async def test_refresh_media_state_without_heos_is_noop() -> None:
    app = AppState()
    assert await app.refresh_media_state() is False


# --- listener must never block on callback work -------------------------------
# Regression guard for the deadlock that the fix above exposed: a callback is
# allowed to issue a HEOS command, but that command's future is resolved by
# `_listen()`. If `_listen()` awaits the callback inline it blocks on itself
# until the 8s timeout, and every other in-flight command times out with it.

@pytest.mark.asyncio
async def test_event_callback_does_not_block_the_reader() -> None:
    import asyncio

    from denon.heos_client import HeosClient

    client = HeosClient("192.0.2.1")
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_callback(_data: dict) -> None:
        entered.set()
        await release.wait()  # stands in for an in-flight HEOS command

    client.on_event(slow_callback)

    # Returns immediately (it is sync) even though the callback is still running.
    client._dispatch_event({"heos": {"command": "event/player_now_playing_changed"}})
    await asyncio.wait_for(entered.wait(), timeout=1)
    assert len(client._callback_tasks) == 1

    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert client._callback_tasks == set()


@pytest.mark.asyncio
async def test_disconnect_cancels_inflight_callbacks() -> None:
    import asyncio

    from denon.heos_client import HeosClient

    client = HeosClient("192.0.2.1")
    entered = asyncio.Event()

    async def hanging_callback(_data: dict) -> None:
        entered.set()
        await asyncio.Event().wait()  # never completes on its own

    client.on_event(hanging_callback)
    client._dispatch_event({"heos": {"command": "event/player_state_changed"}})
    await asyncio.wait_for(entered.wait(), timeout=1)

    await client.disconnect()
    assert client._callback_tasks == set()
