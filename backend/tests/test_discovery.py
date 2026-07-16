from __future__ import annotations

import pytest

from config import settings
from denon import discovery


@pytest.mark.asyncio
async def test_configured_host_is_included_in_discovery(monkeypatch):
    monkeypatch.setattr(settings, "denon_host", "192.168.1.50")
    monkeypatch.setattr(settings, "denon_telnet_port", 2323)
    monkeypatch.setattr(discovery, "_send_ssdp", lambda _st, _timeout: [])
    monkeypatch.setattr(
        discovery,
        "_probe_port",
        lambda ip, port, _timeout: ip == "192.168.1.50" and port in {2323, discovery.HEOS_PORT},
    )

    devices = await discovery.discover_receivers(timeout=1.0)

    assert devices == [
        {
            "ip": "192.168.1.50",
            "model": "Denon/Marantz AVR (configured)",
            "telnet_port": 2323,
            "heos_available": True,
        }
    ]
