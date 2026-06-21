"""Audio settings endpoints: surround, source, channel volume, tone, EQ, eco, sleep."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends

from api.models import (
    ChannelVolumeRequest,
    DynamicEQRequest,
    DynamicVolumeRequest,
    EcoModeRequest,
    MultEQRequest,
    NightModeConfigRequest,
    NightModeRequest,
    SleepTimerRequest,
    SourceRequest,
    SubwooferLevelRequest,
    SurroundRequest,
    ToneRequest,
)
from denon.const import CHANNEL_NAMES
from night_mode import apply_night_mode
from routes._helpers import send_command, send_raw
from state import AppState
from dependencies import get_app_state

router = APIRouter(prefix="/api/v1", tags=["audio"])


@router.post("/source")
async def set_source(req: SourceRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"SI{req.source}")


@router.post("/surround")
async def set_surround(req: SurroundRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"MS{req.mode}")


@router.post("/channel-volume")
async def set_channel_volume(req: ChannelVolumeRequest, state: AppState = Depends(get_app_state)):
    if req.channel not in CHANNEL_NAMES:
        raise HTTPException(400, f"Unknown channel: {req.channel}")
    return await send_command(state, f"CV{req.channel} {req.level:02d}")


@router.post("/channel-volume/reset")
async def reset_channel_volumes(state: AppState = Depends(get_app_state)):
    return await send_command(state, "CVZRL")


@router.post("/tone")
async def set_tone(req: ToneRequest, state: AppState = Depends(get_app_state)):
    results = []
    if req.enabled is not None:
        results.append(await send_raw(state, f"PSTONE CTRL {'ON' if req.enabled else 'OFF'}"))
    if req.bass is not None:
        results.append(await send_raw(state, f"PSBAS {req.bass:02d}"))
    if req.treble is not None:
        results.append(await send_raw(state, f"PSTRE {req.treble:02d}"))
    return {"ok": all(results)}


@router.post("/subwoofer-level")
async def set_subwoofer_level(req: SubwooferLevelRequest, state: AppState = Depends(get_app_state)):
    if req.index == 2:
        return await send_command(state, f"PSSWL2 {req.level:02d}")
    return await send_command(state, f"PSSWL {req.level:02d}")


@router.post("/dynamic-eq")
async def set_dynamic_eq(req: DynamicEQRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"PSDYNEQ {'ON' if req.enabled else 'OFF'}")


@router.post("/dynamic-volume")
async def set_dynamic_volume(req: DynamicVolumeRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"PSDYNVOL {req.mode}")


@router.post("/multeq")
async def set_multeq(req: MultEQRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"PSMULTEQ:{req.mode}")


@router.post("/sleep")
async def set_sleep(req: SleepTimerRequest, state: AppState = Depends(get_app_state)):
    if req.minutes is None or req.minutes == 0:
        return await send_command(state, "SLPOFF")
    return await send_command(state, f"SLP{req.minutes:03d}")


@router.get("/night-mode/config")
async def get_night_mode_config(state: AppState = Depends(get_app_state)):
    return state.night_mode_config


@router.post("/night-mode/config")
async def save_night_mode_config(req: NightModeConfigRequest, state: AppState = Depends(get_app_state)):
    state.set_night_mode_config({
        "mode": req.mode,
        "schedule": req.schedule.model_dump(),
        "channels": [
            {"channel": ch.channel, "mode": ch.mode, "value": ch.value}
            for ch in req.channels
        ],
    })
    return {"ok": True, **state.night_mode_config}


@router.post("/night-mode")
async def set_night_mode(req: NightModeRequest, state: AppState = Depends(get_app_state)):
    return await apply_night_mode(
        state,
        req.enabled,
        [{"channel": ch.channel, "mode": ch.mode, "value": ch.value} for ch in req.channels],
        auto=False,
    )


@router.post("/eco")
async def set_eco(req: EcoModeRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"ECO{req.mode}")

