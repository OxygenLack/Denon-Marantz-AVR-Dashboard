"""Integration tests for API endpoints using FastAPI TestClient."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch settings before importing app to prevent real connections
os.environ["DENON_DASHBOARD_DENON_HOST"] = ""
os.environ["DENON_DASHBOARD_LOG_LEVEL"] = "WARNING"


def _make_mock_telnet(state: dict):
    """Create a mock telnet client with the given state."""
    mock = MagicMock()
    mock.connected = True
    mock.host = "192.168.1.100"
    mock.state = state
    mock.send = AsyncMock(return_value=True)
    mock.refresh = AsyncMock()
    mock.disconnect = AsyncMock()
    return mock


def _make_mock_heos():
    """Create a mock HEOS client."""
    mock = MagicMock()
    mock.connected = True
    mock.play = AsyncMock(return_value=True)
    mock.pause = AsyncMock(return_value=True)
    mock.stop = AsyncMock(return_value=True)
    mock.next_track = AsyncMock(return_value=True)
    mock.previous_track = AsyncMock(return_value=True)
    mock.get_now_playing = AsyncMock(return_value={"song": "Test Song"})
    mock.get_play_state = AsyncMock(return_value="play")
    mock.check_account = AsyncMock(return_value={"signed_in": True, "username": "demo@heos", "reachable": True})
    mock.is_source_available = AsyncMock(return_value=True)
    mock.disconnect = AsyncMock()
    return mock


@pytest.fixture
def mock_app_state(mock_state):
    """Patch app_state with mock clients."""
    from state import app_state

    app_state.telnet = _make_mock_telnet(mock_state)
    app_state.heos = _make_mock_heos()
    app_state.source_name_cache = {"GAME": "Game Console"}
    app_state.speaker_calibration = {"FL": -1.5, "FR": -2.0}
    yield app_state
    app_state.telnet = None
    app_state.heos = None


@pytest.fixture
def mock_app_no_connection():
    """Patch app_state with no connection."""
    from state import app_state

    app_state.telnet = None
    app_state.heos = None
    yield app_state


# ── Health ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_connected(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["telnet_connected"] is True


@pytest.mark.asyncio
async def test_health_disconnected(mock_app_no_connection):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "degraded"
    assert data["telnet_connected"] is False


# ── Status ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_connected(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is True
    assert data["power"] is True
    assert data["volume"] == 50.0
    assert data["source"] == "GAME"
    assert data["source_name"] == "Game Console"


# HA integration contract (denon_avr_telnet polls /status every 5 s): the key
# set may only ever grow. Edit this list deliberately, never remove from it.
STATUS_KEYS = {
    "connected", "heos_connected", "discovering", "theme", "power", "volume",
    "volume_max", "muted", "source", "source_name", "heos_source", "surround_mode",
    "surround_mode_list", "sound_decoder", "channel_volumes", "speaker_calibration",
    "tone_control", "bass", "treble", "subwoofer_level", "subwoofer2_level",
    "dialog_level", "dialog_level_enabled", "multeq", "dynamic_eq", "dynamic_volume",
    "ref_level_offset", "sleep_timer", "night_mode_enabled", "night_mode_snapshot",
    "eco_mode", "z2_power", "z2_volume", "z2_muted", "z2_sleep_timer", "z2_source",
    "z2_source_name", "now_playing", "play_state", "stream_quality",
}


@pytest.mark.asyncio
async def test_status_key_set_is_stable(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        data = (await ac.get("/api/v1/status")).json()
    assert set(data) == STATUS_KEYS
    assert data["heos_connected"] is True


@pytest.mark.asyncio
async def test_status_heos_connected_false_when_heos_down(mock_app_state):
    from main import app

    mock_app_state.heos.connected = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        data = (await ac.get("/api/v1/status")).json()
    assert data["heos_connected"] is False


@pytest.mark.asyncio
async def test_status_not_initialized(mock_app_no_connection):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/status")
    assert resp.status_code == 503


# ── Power ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_power_on(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/power/on")
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("PWON")


@pytest.mark.asyncio
async def test_power_off(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/power/off")
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("PWSTANDBY")


# ── Volume ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_set_volume(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/volume", json={"level": 45.0})
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("MV45")


@pytest.mark.asyncio
async def test_set_volume_half_step(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/volume", json={"level": 45.5})
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("MV455")


@pytest.mark.asyncio
async def test_volume_up(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/volume/up")
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("MVUP")


# ── Source ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_set_source(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/source", json={"source": "TV"})
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("SITV")


# ── Night Mode ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_night_mode_enable_absolute_and_offset(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/night-mode", json={
            "enabled": True,
            "channels": [
                {"channel": "SW", "mode": "absolute", "value": 38},
                {"channel": "FL", "mode": "offset", "value": -4},
            ],
        })
    assert resp.status_code == 200
    assert mock_app_state.night_mode_enabled is True
    assert mock_app_state.night_mode_snapshot["FL"] == 50
    mock_app_state.telnet.send.assert_any_call("CVSW 38")
    mock_app_state.telnet.send.assert_any_call("CVFL 46")


@pytest.mark.asyncio
async def test_night_mode_disable_restores_snapshot(mock_app_state):
    from main import app

    mock_app_state.night_mode_enabled = True
    mock_app_state.night_mode_snapshot = {"FL": 50, "SW": 52}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/night-mode", json={"enabled": False, "channels": []})
    assert resp.status_code == 200
    assert mock_app_state.night_mode_enabled is False
    assert mock_app_state.night_mode_snapshot == {}
    mock_app_state.telnet.send.assert_any_call("CVFL 50")
    mock_app_state.telnet.send.assert_any_call("CVSW 52")


@pytest.mark.asyncio
async def test_night_mode_partial_failure_keeps_snapshot(mock_app_state):
    """A send failing mid-apply must leave Disable able to restore the originals."""
    from main import app

    mock_app_state.night_mode_enabled = False
    mock_app_state.night_mode_snapshot = {}
    mock_app_state.telnet.send = AsyncMock(side_effect=[True, False])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/night-mode", json={
            "enabled": True,
            "channels": [
                {"channel": "FL", "mode": "offset", "value": -4},
                {"channel": "SW", "mode": "offset", "value": -6},
            ],
        })
        assert resp.status_code == 502
        assert mock_app_state.night_mode_enabled is True
        assert mock_app_state.night_mode_snapshot["FL"] == 50
        assert mock_app_state.night_mode_snapshot["SW"] == 52

        # The receiver now reports the lowered FL trim; a retry must not
        # overwrite the snapshot with it.
        mock_app_state.telnet.state["channel_volumes"]["FL"] = 46
        mock_app_state.telnet.send = AsyncMock(return_value=True)
        resp = await ac.post("/api/v1/night-mode", json={"enabled": False, "channels": []})

    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_any_call("CVFL 50")
    mock_app_state.telnet.send.assert_any_call("CVSW 52")
    assert mock_app_state.night_mode_snapshot == {}
    assert mock_app_state.night_mode_enabled is False


@pytest.mark.asyncio
async def test_night_mode_schedule_rejects_99_99(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/night-mode/config", json={
            "schedule": {"enabled": True, "days": ["mon"], "start": "99:99", "end": "02:00"},
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("channel", [
    {"channel": "FL", "mode": "absolute", "value": 70},
    {"channel": "FL", "mode": "offset", "value": -30},
    {"channel": "XX", "mode": "offset", "value": -2},
])
async def test_night_mode_channel_value_out_of_range(mock_app_state, channel):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/night-mode", json={"enabled": True, "channels": [channel]})
    assert resp.status_code == 422


def test_normalize_night_mode_config_drops_junk():
    from night_mode_config import normalize_night_mode_config

    cfg = normalize_night_mode_config({
        "mode": "offset",
        "schedule": {"start": "99:99", "end": "7:5", "timezone": "Mars/Base", "days": ["mon", "xyz"]},
        "channels": [
            {"channel": "FL", "mode": "offset", "value": -4},
            {"channel": "XX", "mode": "offset", "value": -4},
            {"channel": "FR", "mode": "absolute", "value": 90},
            "junk",
        ],
    })
    assert cfg["schedule"]["start"] == "22:00"
    assert cfg["schedule"]["end"] == "02:00"
    assert cfg["schedule"]["days"] == ["mon"]
    assert cfg["schedule"]["timezone"] == "Europe/Berlin"
    assert cfg["channels"] == [{"channel": "FL", "mode": "offset", "value": -4}]


# ── Media ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_media_play(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/media/play")
    assert resp.status_code == 200
    mock_app_state.heos.play.assert_called_once()


@pytest.mark.asyncio
async def test_media_now_playing(mock_app_state):
    from main import app

    # Pre-populate cached media state (normally filled by background poller)
    mock_app_state.media_state = {
        "now_playing": {"song": "Test Song"},
        "play_state": "play",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/media/now-playing")
    assert resp.status_code == 200
    data = resp.json()
    assert data["now_playing"]["song"] == "Test Song"
    assert data["play_state"] == "play"


# ── Radio status ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_radio_status_ok(mock_app_state):
    import radio_service
    from main import app

    radio_service._cached_station_count = 0
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/media/radio/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ready"] is True
    assert data["reason"] == "ok"
    assert data["account_signed_in"] is True


@pytest.mark.asyncio
async def test_radio_status_signed_out(mock_app_state):
    import radio_service
    from main import app

    radio_service._cached_station_count = 0
    mock_app_state.heos.check_account = AsyncMock(
        return_value={"signed_in": False, "username": None, "reachable": True})
    mock_app_state.heos.is_source_available = AsyncMock(return_value=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/media/radio/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ready"] is False
    assert data["reason"] == "signed_out"


@pytest.mark.asyncio
async def test_radio_status_no_heos(mock_app_no_connection):
    import radio_service
    from main import app

    radio_service._cached_station_count = 0
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/media/radio/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ready"] is False
    assert data["reason"] == "no_heos"


# ── Zone 2 ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_z2_power_on(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/zone2/power/on")
    assert resp.status_code == 200
    mock_app_state.telnet.send.assert_called_with("Z2ON")


# ── Device Info ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_device_info(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/device")
    assert resp.status_code == 200
    data = resp.json()
    assert data["device_name"] == "Denon AVR"
    assert "channel_names" in data
    assert data["source_name_map"]["GAME"] == "Game Console"


@pytest.mark.asyncio
async def test_source_name_persist_and_reset(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/source-names/GAME", json={"name": "PlayStation 5"})
        assert resp.status_code == 200
        resp = await ac.get("/api/v1/device")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_name_map"]["GAME"] == "PlayStation 5"
        assert data["source_name_overrides"]["GAME"] == "PlayStation 5"
        resp = await ac.delete("/api/v1/source-names/GAME")
        assert resp.status_code == 200
        resp = await ac.get("/api/v1/device")
        assert resp.json()["source_name_map"]["GAME"] == "Game Console"


@pytest.mark.asyncio
async def test_ui_theme_persisted_in_device_info(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/ui-settings", json={"theme": "purple"})
        assert resp.status_code == 200
        resp = await ac.get("/api/v1/device")
        assert resp.status_code == 200
        assert resp.json()["theme"] == "purple"


# ── Not Connected ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_commands_503_when_disconnected(mock_app_no_connection):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for endpoint in ["/api/v1/power/on", "/api/v1/volume/up", "/api/v1/mute/on"]:
            resp = await ac.post(endpoint)
            assert resp.status_code == 503, f"{endpoint} should return 503"


# ── Speaker calibration resync ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_calibration_refresh_picks_up_changed_offsets(monkeypatch):
    """A level edited on the receiver must reach the cache (stale SW -11 dB, 2026-08-16)."""
    import calibration as cal_mod
    from state import app_state

    app_state.receiver_host = "192.168.1.100"
    app_state.speaker_calibration = {"FL": 0.0, "SW": -11.0}
    monkeypatch.setattr(
        cal_mod, "fetch_speaker_calibration",
        AsyncMock(return_value={"FL": 0.0, "SW": 0.0}),
    )

    assert await app_state.refresh_speaker_calibration() is True
    assert app_state.speaker_calibration == {"FL": 0.0, "SW": 0.0}

    # Unchanged fetch -> no broadcast
    assert await app_state.refresh_speaker_calibration() is False


@pytest.mark.asyncio
async def test_calibration_refresh_keeps_cache_when_receiver_unreachable(monkeypatch):
    """Standby/HTTP failure returns {} — must NOT wipe the known offsets."""
    import calibration as cal_mod
    from state import app_state

    app_state.receiver_host = "192.168.1.100"
    app_state.speaker_calibration = {"FR": -4.5}
    monkeypatch.setattr(cal_mod, "fetch_speaker_calibration", AsyncMock(return_value={}))

    assert await app_state.refresh_speaker_calibration() is False
    assert app_state.speaker_calibration == {"FR": -4.5}


# ── WebSocket origin check ─────────────────────────────────────────────────────

def _ws_client():
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


def test_ws_foreign_origin_rejected_without_cors_config(mock_app_state, monkeypatch):
    from starlette.websockets import WebSocketDisconnect

    import main

    monkeypatch.setattr(main, "cors_origins", [])
    with _ws_client() as tc:
        with pytest.raises(WebSocketDisconnect) as exc:
            with tc.websocket_connect("/api/v1/ws", headers={"origin": "http://evil.example"}):
                pass
    assert exc.value.code == 4003


def test_ws_same_host_origin_accepted(mock_app_state, monkeypatch):
    import main

    monkeypatch.setattr(main, "cors_origins", [])
    with _ws_client() as tc:
        with tc.websocket_connect("/api/v1/ws", headers={"origin": "http://testserver"}) as ws:
            data = ws.receive_json()
    assert data["connected"] is True


def test_ws_empty_origin_accepted(mock_app_state, monkeypatch):
    import main

    monkeypatch.setattr(main, "cors_origins", [])
    with _ws_client() as tc:
        with tc.websocket_connect("/api/v1/ws") as ws:
            data = ws.receive_json()
    assert "heos_connected" in data


def test_ws_origin_checked_against_cors_list_when_configured(mock_app_state, monkeypatch):
    from starlette.websockets import WebSocketDisconnect

    import main

    monkeypatch.setattr(main, "cors_origins", ["http://allowed.example"])
    with _ws_client() as tc:
        with tc.websocket_connect("/api/v1/ws", headers={"origin": "http://allowed.example"}) as ws:
            ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as exc:
            with tc.websocket_connect("/api/v1/ws", headers={"origin": "http://testserver"}):
                pass
    assert exc.value.code == 4003


# ── Phase 4: WebSocket robustness, /device surface, validation ────────────────

def test_ws_non_object_json_keeps_connection(mock_app_state, monkeypatch):
    import time

    import main

    monkeypatch.setattr(main, "cors_origins", [])
    with _ws_client() as tc:
        with tc.websocket_connect("/api/v1/ws") as ws:
            ws.receive_json()  # initial frame
            ws.send_text("[1, 2, 3]")
            ws.send_text('"MVUP"')
            ws.send_text("not json")
            ws.send_text('{"command": "MVUP"}')
            # Still connected: the valid command reaches the telnet client.
            for _ in range(50):
                if mock_app_state.telnet.send.await_count:
                    break
                time.sleep(0.01)
    mock_app_state.telnet.send.assert_awaited_with("MVUP")


def test_ws_initial_frame_without_telnet(mock_app_no_connection, monkeypatch):
    import main

    monkeypatch.setattr(main, "cors_origins", [])
    with _ws_client() as tc:
        with tc.websocket_connect("/api/v1/ws") as ws:
            data = ws.receive_json()
    assert data["connected"] is False
    assert data["power"] is None


async def _get_device(app_state) -> dict:
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/v1/device")
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_device_receiver_ip_null_without_host(mock_app_no_connection, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "denon_host", "")
    monkeypatch.setattr(mock_app_no_connection, "receiver_host", None)
    data = await _get_device(mock_app_no_connection)
    assert data["receiver_ip"] is None


@pytest.mark.asyncio
async def test_device_receiver_ip_follows_connect(mock_app_state, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "denon_host", "")
    monkeypatch.setattr(mock_app_state, "receiver_host", "192.168.1.77")
    data = await _get_device(mock_app_state)
    assert data["receiver_ip"] == "192.168.1.77"


@pytest.mark.asyncio
async def test_device_lists_present(mock_app_state):
    data = await _get_device(mock_app_state)
    assert "NET" in data["media_sources"] and "MPLAY" in data["media_sources"]
    assert [c["code"] for c in data["surround_categories"]] == ["MOV", "MUS", "GAM", "PUR"]
    assert data["surround_categories"][3] == {"code": "PUR", "label": "Pure/Direct", "command": "DIRECT"}
    assert "STEREO" in data["surround_modes"]
    game = next(s for s in data["sources"] if s["id"] == "GAME")
    assert game["default_name"] == "Game Console"  # env config, no rename
    assert all("default_name" in s for s in data["sources"])


@pytest.mark.asyncio
async def test_device_default_name_ignores_rename(mock_app_state):
    mock_app_state.source_name_overrides = {"GAME": "PS5"}
    data = await _get_device(mock_app_state)
    game = next(s for s in data["sources"] if s["id"] == "GAME")
    assert game["name"] == "PS5"
    assert game["default_name"] == "Game Console"


@pytest.mark.asyncio
async def test_device_channel_names_in_canonical_order(mock_app_state):
    # Receiver order differs from the canonical CHANNEL_NAMES order.
    mock_app_state.telnet.state["channel_volumes"] = {"SW": 50, "C": 50, "FR": 50, "FL": 50}
    data = await _get_device(mock_app_state)
    assert list(data["channel_names"]) == ["FL", "FR", "C", "SW"]


@pytest.mark.asyncio
async def test_volume_rejects_tenth_steps(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        bad = await ac.post("/api/v1/volume", json={"level": 50.3})
        good = await ac.post("/api/v1/volume", json={"level": 50.5})
    assert bad.status_code == 422
    assert good.status_code == 200
    mock_app_state.telnet.send.assert_called_with("MV505")


@pytest.mark.asyncio
async def test_ui_settings_rejects_unknown_theme(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/ui-settings", json={"theme": "neon"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_tone_503_when_disconnected(mock_app_state):
    from main import app

    mock_app_state.telnet.connected = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/tone", json={"bass": 52})
        empty = await ac.post("/api/v1/tone", json={})
    assert resp.status_code == 503
    assert empty.status_code == 400
    mock_app_state.telnet.send.assert_not_called()


@pytest.mark.asyncio
async def test_connect_rejects_public_ip(mock_app_state):
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        public = await ac.post("/api/v1/connect", json={"host": "8.8.8.8"})
        junk = await ac.post("/api/v1/connect", json={"host": "not-an-ip"})
        loop = await ac.post("/api/v1/connect", json={"command": "127.0.0.1"})
    assert public.status_code == 400
    assert junk.status_code == 400
    assert loop.status_code == 400


def test_radio_favorites_malformed_entry_skipped(tmp_path):
    import json

    from state import AppState

    app = AppState()
    app.radio_favorites_path = tmp_path / "radio_favorites.json"
    app.radio_favorites_path.write_text(json.dumps([
        {"mid": "s1", "name": "Radio One"},
        {"mid": "", "name": "empty mid"},
        {"mid": "s2"},
        {"mid": 3, "name": "numeric mid"},
        "junk",
    ]))
    app.load_radio_favorites()
    assert app.radio_favorites == [{"mid": "s1", "name": "Radio One"}]
