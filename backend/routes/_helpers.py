"""Shared route helpers — DRY wrappers for telnet command dispatch."""
from __future__ import annotations

from fastapi import HTTPException
from state import AppState


async def send_command(state: AppState, cmd: str) -> dict:
    """Send a telnet command and return ``{"ok": True}`` on success.

    Raises:
        HTTPException 503 if no telnet connection is active.
        HTTPException 502 if the send fails.
    """
    if not state.telnet:
        raise HTTPException(503, "Not connected")
    ok = await state.telnet.send(cmd)
    if not ok:
        raise HTTPException(502, "Failed to send")
    return {"ok": True}


async def send_raw(state: AppState, cmd: str) -> bool:
    """Send a telnet command and return the raw success boolean (no exception)."""
    if not state.telnet:
        return False
    return await state.telnet.send(cmd)

