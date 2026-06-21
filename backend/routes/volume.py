"""Volume and mute control endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from api.models import VolumeRequest
from routes._helpers import send_command
from state import AppState
from dependencies import get_app_state

router = APIRouter(prefix="/api/v1", tags=["volume"])


@router.post("/volume")
async def set_volume(req: VolumeRequest, state: AppState = Depends(get_app_state)):
    if req.level == int(req.level):
        cmd = f"MV{int(req.level):02d}"
    else:
        cmd = f"MV{int(req.level):02d}5"
    return await send_command(state, cmd)


@router.post("/volume/up")
async def volume_up(state: AppState = Depends(get_app_state)):
    return await send_command(state, "MVUP")


@router.post("/volume/down")
async def volume_down(state: AppState = Depends(get_app_state)):
    return await send_command(state, "MVDOWN")


@router.post("/mute/on")
async def mute_on(state: AppState = Depends(get_app_state)):
    return await send_command(state, "MUON")


@router.post("/mute/off")
async def mute_off(state: AppState = Depends(get_app_state)):
    return await send_command(state, "MUOFF")


@router.post("/mute/toggle")
async def mute_toggle(state: AppState = Depends(get_app_state)):
    if state.telnet and state.telnet.state.get("muted"):
        return await send_command(state, "MUOFF")
    return await send_command(state, "MUON")

