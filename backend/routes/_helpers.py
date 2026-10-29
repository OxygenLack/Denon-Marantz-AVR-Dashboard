"""Shared route helpers — DRY wrappers for telnet and HEOS command dispatch."""
from __future__ import annotations

from fastapi import HTTPException

from denon.telnet_client import DenonTelnetClient
from state import AppState


def require_telnet(state: AppState) -> DenonTelnetClient:
    """Return the connected telnet client or raise 503."""
    if not state.telnet or not state.telnet.connected:
        raise HTTPException(503, "Not connected")
    return state.telnet


async def send_command(state: AppState, cmd: str) -> dict:
    """Send a telnet command and return ``{"ok": True}`` on success.

    Raises:
        HTTPException 503 if the telnet link is down.
        HTTPException 502 if the send fails.
    """
    ok = await require_telnet(state).send(cmd)
    if not ok:
        raise HTTPException(502, "Failed to send")
    return {"ok": True}


async def heos_action(state: AppState, method: str, label: str) -> dict:
    """Call a HEOS transport method (``play``, ``next_track``, ...).

    Raises:
        HTTPException 503 if there is no HEOS client.
        HTTPException 502 if the command did not succeed.
    """
    if not state.heos:
        raise HTTPException(503, "HEOS not connected")
    ok = await getattr(state.heos, method)()
    if not ok:
        raise HTTPException(502, f"{label} command failed")
    return {"ok": True}
