"""Zone 2 control endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from api.models import SourceRequest, Zone2VolumeRequest
from routes._helpers import send_command
from state import AppState
from dependencies import get_app_state

router = APIRouter(prefix="/api/v1/zone2", tags=["zone2"])


@router.post("/power/on")
async def z2_power_on(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2ON")


@router.post("/power/off")
async def z2_power_off(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2OFF")


@router.post("/volume")
async def z2_volume(req: Zone2VolumeRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"Z2{req.level:02d}")


@router.post("/volume/up")
async def z2_volume_up(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2UP")


@router.post("/volume/down")
async def z2_volume_down(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2DOWN")


@router.post("/mute/on")
async def z2_mute_on(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2MUON")


@router.post("/mute/off")
async def z2_mute_off(state: AppState = Depends(get_app_state)):
    return await send_command(state, "Z2MUOFF")


@router.post("/source")
async def z2_source(req: SourceRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"Z2{req.source}")

