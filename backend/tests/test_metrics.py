"""Tests for the /metrics Prometheus endpoint."""
from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon.telnet_client import DenonTelnetClient
from main import app
from state import app_state


def _parse(body: str) -> dict[str, str]:
    """Return {metric_name_with_labels: value} for every sample line."""
    samples: dict[str, str] = {}
    for line in body.splitlines():
        if not line or line.startswith("#"):
            continue
        name, _, value = line.rpartition(" ")
        samples[name] = value
    return samples


@pytest.fixture
def connected_client(monkeypatch):
    """Install a telnet client that looks connected, with known receiver state."""
    client = DenonTelnetClient("192.0.2.10", 23)
    client._connected = True
    client._connects_total = 3
    client._reconnect_attempts = 0
    client._last_connected_at = 1_700_000_000.0
    client._supervisor_task = MagicMock()
    client._supervisor_task.done = MagicMock(return_value=False)
    client.state["power"] = True
    client.state["volume"] = 42.5
    client.state["muted"] = False

    heos = MagicMock()
    heos.connected = True
    heos.player_id = -12345
    heos.pending_count = 2
    heos.lock_waiters = 1
    heos.callback_task_count = 3
    # lifespan shutdown awaits this
    heos.disconnect = AsyncMock()

    monkeypatch.setattr(app_state, "telnet", client)
    monkeypatch.setattr(app_state, "heos", heos)
    monkeypatch.setattr(app_state, "discovering", False)
    return client


def test_metrics_exposition_format(connected_client):
    with TestClient(app) as tc:
        resp = tc.get("/metrics")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/plain")

    body = resp.text
    # Every sample must be preceded by its HELP and TYPE
    for name in ("denon_telnet_connected", "denon_telnet_connects_total"):
        assert f"# HELP {name} " in body
        assert f"# TYPE {name} " in body
    assert "# TYPE denon_telnet_connects_total counter" in body
    assert "# TYPE denon_telnet_connected gauge" in body


def test_metrics_report_connected_state(connected_client):
    with TestClient(app) as tc:
        samples = _parse(tc.get("/metrics").text)

    assert samples["denon_telnet_connected"] == "1"
    assert samples["denon_telnet_supervised"] == "1"
    assert samples["denon_telnet_reconnect_attempts"] == "0"
    assert samples["denon_telnet_connects_total"] == "3"
    assert samples["denon_telnet_last_connected_timestamp_seconds"] == "1700000000"
    assert samples["denon_heos_connected"] == "1"
    assert samples["denon_heos_player_known"] == "1"
    assert samples["denon_receiver_power"] == "1"
    assert samples["denon_receiver_volume"] == "42.5"
    assert samples["denon_receiver_muted"] == "0"
    assert float(samples["denon_dashboard_start_timestamp_seconds"]) > 0


def test_metrics_report_disconnected_state(monkeypatch):
    """The alerting case: link down, supervisor still running, attempts climbing."""
    client = DenonTelnetClient("192.0.2.10", 23)
    client._connected = False
    client._reconnect_attempts = 7
    client._supervisor_task = MagicMock()
    client._supervisor_task.done = MagicMock(return_value=False)

    monkeypatch.setattr(app_state, "telnet", client)
    monkeypatch.setattr(app_state, "heos", None)

    with TestClient(app) as tc:
        samples = _parse(tc.get("/metrics").text)

    assert samples["denon_telnet_connected"] == "0"
    assert samples["denon_telnet_supervised"] == "1"
    assert samples["denon_telnet_reconnect_attempts"] == "7"
    assert samples["denon_telnet_last_connected_timestamp_seconds"] == "0"
    assert samples["denon_heos_connected"] == "0"


def test_supervised_is_zero_when_the_supervisor_died(monkeypatch):
    """The one condition that is ALWAYS a bug, never a receiver in standby."""
    client = DenonTelnetClient("192.0.2.10", 23)
    client._connected = False
    client._supervisor_task = None

    monkeypatch.setattr(app_state, "telnet", client)
    monkeypatch.setattr(app_state, "heos", None)

    with TestClient(app) as tc:
        samples = _parse(tc.get("/metrics").text)

    assert samples["denon_telnet_supervised"] == "0"


def test_unknown_receiver_values_are_omitted_not_zero(monkeypatch):
    """A receiver that never answered must not read as 'off, muted, volume 0'."""
    client = DenonTelnetClient("192.0.2.10", 23)
    client._connected = False
    monkeypatch.setattr(app_state, "telnet", client)
    monkeypatch.setattr(app_state, "heos", None)

    with TestClient(app) as tc:
        body = tc.get("/metrics").text
    samples = _parse(body)

    assert "denon_receiver_power" not in samples
    assert "denon_receiver_volume" not in samples
    assert "denon_receiver_muted" not in samples
    # but the link metrics are always present
    assert "denon_telnet_connected" in samples


def test_info_label_values_are_escaped(monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "denon_device_name", 'Ali"ce\\Bob')
    client = DenonTelnetClient("192.0.2.10", 23)
    monkeypatch.setattr(app_state, "telnet", client)
    monkeypatch.setattr(app_state, "heos", None)

    with TestClient(app) as tc:
        body = tc.get("/metrics").text

    assert 'device_name="Ali\\"ce\\\\Bob"' in body


def test_metrics_survive_a_completely_uninitialised_state(monkeypatch):
    """Scraped before the receiver was ever configured — must not 500."""
    monkeypatch.setattr(app_state, "telnet", None)
    monkeypatch.setattr(app_state, "heos", None)

    with TestClient(app) as tc:
        resp = tc.get("/metrics")

    assert resp.status_code == 200
    samples = _parse(resp.text)
    assert samples["denon_telnet_connected"] == "0"
    assert samples["denon_telnet_supervised"] == "0"


# ── leak observability (Phase 4 of the 2026-10-23 plan) ───────────────────────

NEW_GAUGES = (
    "denon_dashboard_asyncio_tasks",
    "denon_dashboard_radio_cache_entries",
    "denon_heos_pending_commands",
    "denon_heos_lock_waiters",
    "denon_heos_callback_tasks",
)


def test_leak_gauges_render_with_help_and_type(connected_client):
    with TestClient(app) as tc:
        body = tc.get("/metrics").text
    samples = _parse(body)
    for name in NEW_GAUGES:
        assert f"# HELP {name} " in body, name
        assert f"# TYPE {name} gauge" in body, name
        assert name in samples, name
    assert samples["denon_heos_pending_commands"] == "2"
    assert samples["denon_heos_lock_waiters"] == "1"
    assert samples["denon_heos_callback_tasks"] == "3"
    assert int(samples["denon_dashboard_asyncio_tasks"]) >= 1


def test_heos_gauges_are_zero_without_heos(monkeypatch):
    monkeypatch.setattr(app_state, "telnet", None)
    monkeypatch.setattr(app_state, "heos", None)
    with TestClient(app) as tc:
        samples = _parse(tc.get("/metrics").text)
    assert samples["denon_heos_pending_commands"] == "0"
    assert samples["denon_heos_lock_waiters"] == "0"


def test_rss_is_omitted_when_proc_is_unavailable(connected_client, monkeypatch):
    import builtins

    from routes import metrics as metrics_mod

    real_open = builtins.open

    def fake_open(path, *args, **kwargs):
        if path == "/proc/self/statm":
            raise FileNotFoundError(path)
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", fake_open)
    assert metrics_mod._resident_memory_bytes() is None
    with TestClient(app) as tc:
        body = tc.get("/metrics").text
    assert "denon_dashboard_process_resident_memory_bytes" not in body


def test_rss_is_read_from_statm(monkeypatch):
    import io

    from routes import metrics as metrics_mod

    monkeypatch.setattr("builtins.open", lambda *a, **k: io.StringIO("5000 1024 300 1 0 200 0\n"))
    monkeypatch.setattr(metrics_mod.os, "sysconf", lambda _name: 4096)
    assert metrics_mod._resident_memory_bytes() == 1024 * 4096
