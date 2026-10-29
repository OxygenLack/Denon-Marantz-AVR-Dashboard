"""Audio settings endpoints: surround, source, channel volume, tone, EQ, eco, sleep."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

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
from dependencies import get_app_state
from night_mode import NightModeError, apply_night_mode
from routes._helpers import send_command
from state import AppState

router = APIRouter(prefix="/api/v1", tags=["audio"])


@router.post("/source")
async def set_source(req: SourceRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"SI{req.source}")


@router.post("/surround")
async def set_surround(req: SurroundRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"MS{req.mode}")


@router.post("/channel-volume")
async def set_channel_volume(req: ChannelVolumeRequest, state: AppState = Depends(get_app_state)):
    # The model rejects unknown channel codes (422).
    return await send_command(state, f"CV{req.channel} {req.level:02d}")


@router.post("/channel-volume/reset")
async def reset_channel_volumes(state: AppState = Depends(get_app_state)):
    return await send_command(state, "CVZRL")


@router.post("/tone")
async def set_tone(req: ToneRequest, state: AppState = Depends(get_app_state)):
    cmds = []
    if req.enabled is not None:
        cmds.append(f"PSTONE CTRL {'ON' if req.enabled else 'OFF'}")
    if req.bass is not None:
        cmds.append(f"PSBAS {req.bass:02d}")
    if req.treble is not None:
        cmds.append(f"PSTRE {req.treble:02d}")
    if not cmds:
        raise HTTPException(400, "nothing to set")
    for cmd in cmds:
        await send_command(state, cmd)  # 503 / 502 like every other setter
    return {"ok": True}


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
    try:
        return await apply_night_mode(
            state,
            req.enabled,
            [{"channel": ch.channel, "mode": ch.mode, "value": ch.value} for ch in req.channels],
            auto=False,
        )
    except NightModeError as err:
        raise HTTPException(err.status, err.detail) from err


@router.post("/eco")
async def set_eco(req: EcoModeRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, f"ECO{req.mode}")

