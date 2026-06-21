"""Power control endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from routes._helpers import send_command
from state import AppState
from dependencies import get_app_state

router = APIRouter(prefix="/api/v1", tags=["power"])


@router.post("/power/on")
async def power_on(state: AppState = Depends(get_app_state)):
    return await send_command(state, "PWON")


@router.post("/power/off")
async def power_off(state: AppState = Depends(get_app_state)):
    return await send_command(state, "PWSTANDBY")


@router.post("/power/toggle")
async def power_toggle(state: AppState = Depends(get_app_state)):
    if state.telnet and state.telnet.state.get("power"):
        return await send_command(state, "PWSTANDBY")
    return await send_command(state, "PWON")

