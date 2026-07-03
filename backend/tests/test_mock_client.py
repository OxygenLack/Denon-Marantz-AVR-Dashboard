"""Tests for MockDenonClient — the demo-mode simulated receiver."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon.const import QUERY_COMMANDS
from denon.mock_client import MockDenonClient


@pytest.fixture
def mock_client():
    """A connected MockDenonClient (no network)."""
    return MockDenonClient()


def test_construct_no_network(mock_client):
    """Mock can be built without a host/port and reports connected."""
    assert mock_client.connected is True
    assert mock_client.host == "mock"


@pytest.mark.asyncio
async def test_connect_disconnect(mock_client):
    await mock_client.connect()
    assert mock_client.connected is True
    await mock_client.disconnect()
    assert mock_client.connected is False


def test_simulate_core_queries(mock_client):
    """MV?/SI?/PW? produce parseable synthetic responses."""
    assert mock_client._simulate("PW?") == ["PWON"]
    assert mock_client._simulate("SI?") == ["SIGAME"]
    mv = mock_client._simulate("MV?")
    assert mv[0] == "MV45"
    assert mv[1] == "MVMAX98"


def test_every_query_command_answered(mock_client):
    """Mock answers every command in the CURRENT QUERY_COMMANDS list."""
    unanswered = [c for c in QUERY_COMMANDS if not mock_client._simulate(c)]
    assert unanswered == [], f"unanswered queries: {unanswered}"


@pytest.mark.asyncio
async def test_send_feeds_parser(mock_client):
    """send() routes synthetic responses through the real _parse() path."""
    # Flip mute and confirm state updates via the parser
    await mock_client.send("MUON")
    assert mock_client.state["muted"] is True
    await mock_client.send("MUOFF")
    assert mock_client.state["muted"] is False


@pytest.mark.asyncio
async def test_build_status_against_mock():
    """AppState.build_status() works against the mock with no KeyError."""
    from state import AppState

    state = AppState()
    state.telnet = MockDenonClient()
    status = state.build_status()
    assert status["connected"] is True
    assert status["power"] is True
    assert status["volume"] == 45.0
    assert status["source"] == "GAME"
    assert status["source_name"] == "Game Console"
    assert len(status["surround_mode_list"]) == 9


@pytest.mark.asyncio
async def test_start_demo_installs_mock():
    """start_demo() installs a MockDenonClient as the telnet client."""
    from state import AppState

    state = AppState()
    await state.start_demo()
    assert isinstance(state.telnet, MockDenonClient)
    assert state.telnet.connected is True
