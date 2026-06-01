"""Android TV Remote protocol endpoints."""
from __future__ import annotations

import ipaddress
import asyncio
import logging
from typing import Literal

from androidtvremote2 import CannotConnect, ConnectionClosed, InvalidAuth
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from androidtv.discovery import discover_android_tvs
from state import app_state

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/androidtv", tags=["androidtv"])

AndroidTvKey = Literal[
    "DPAD_UP",
    "DPAD_DOWN",
    "DPAD_LEFT",
    "DPAD_RIGHT",
    "DPAD_CENTER",
    "BACK",
    "HOME",
    "MENU",
    "POWER",
    "SLEEP",
    "MEDIA_PLAY_PAUSE",
    "MEDIA_PLAY",
    "MEDIA_PAUSE",
    "MEDIA_STOP",
    "MEDIA_NEXT",
    "MEDIA_PREVIOUS",
    "VOLUME_UP",
    "VOLUME_DOWN",
    "VOLUME_MUTE",
    "MUTE",
    "CHANNEL_UP",
    "CHANNEL_DOWN",
]


class AndroidTvHostRequest(BaseModel):
    host: str = Field(..., min_length=2, max_length=80)


class AndroidTvPairFinishRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=32, pattern=r"^\s*[A-Za-z0-9]{4,12}\s*$")


class AndroidTvKeyRequest(BaseModel):
    key: AndroidTvKey


class AndroidTvTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500, pattern=r"^[^\r\n]+$")


class AndroidTvAdbConnectRequest(BaseModel):
    host: str = Field(..., min_length=2, max_length=80)
    port: int = Field(5555, ge=1, le=65535)


class AndroidTvAdbPairRequest(BaseModel):
    host: str = Field(..., min_length=2, max_length=80)
    port: int = Field(..., ge=1, le=65535)
    code: str = Field(..., min_length=4, max_length=32, pattern=r"^\s*[A-Za-z0-9]{4,12}\s*$")


class AndroidTvAdbAppRequest(BaseModel):
    package: str = Field(..., min_length=3, max_length=200, pattern=r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$")
    activity: str | None = Field(None, min_length=1, max_length=300, pattern=r"^(?:[A-Za-z0-9_.$]+|\.[A-Za-z0-9_.$]+)$")


class AndroidTvAdbFavoriteRequest(BaseModel):
    package: str = Field(..., min_length=3, max_length=200, pattern=r"^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$")
    favorite: bool


class AndroidTvAdbPowerRequest(BaseModel):
    action: Literal["wake", "sleep", "power", "reboot"]


@router.get("/status")
async def androidtv_status():
    return app_state.android_tv.build_status()


@router.get("/discover")
async def androidtv_discover():
    try:
        return {"devices": await discover_android_tvs(timeout=4.0)}
    except Exception as exc:
        _LOGGER.error("Android TV discovery error: %s", exc)
        raise HTTPException(500, "Discovery failed")


@router.post("/connect")
async def androidtv_connect(req: AndroidTvHostRequest):
    host = _validate_lan_ip(req.host)
    try:
        status = await app_state.android_tv.connect(host)
        await _try_adb_autoconnect(host)
        return status
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/disconnect")
async def androidtv_disconnect():
    await app_state.android_tv.disconnect(clear_host=True)
    return app_state.android_tv.build_status()


@router.post("/pair/start")
async def androidtv_pair_start(req: AndroidTvHostRequest):
    host = _validate_lan_ip(req.host)
    try:
        return await app_state.android_tv.start_pairing(host)
    except (CannotConnect, ConnectionClosed):
        raise HTTPException(502, "Could not start pairing")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/pair/finish")
async def androidtv_pair_finish(req: AndroidTvPairFinishRequest):
    try:
        status = await app_state.android_tv.finish_pairing(req.code.strip().upper())
        host = app_state.android_tv.host
        if host:
            await _try_adb_autoconnect(host)
        return status
    except InvalidAuth:
        raise HTTPException(401, "Invalid pairing code")
    except ConnectionClosed:
        raise HTTPException(409, "Pairing has not been started")
    except CannotConnect:
        raise HTTPException(502, "Could not connect after pairing")


@router.post("/key")
async def androidtv_key(req: AndroidTvKeyRequest):
    try:
        return await app_state.android_tv.send_key(req.key)
    except ConnectionClosed:
        raise HTTPException(503, "Android TV not connected")
    except ValueError:
        raise HTTPException(400, "Unsupported key")


@router.post("/text")
async def androidtv_text(req: AndroidTvTextRequest):
    try:
        return await app_state.android_tv.send_text(req.text)
    except ConnectionClosed:
        raise HTTPException(503, "Android TV not connected")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/adb/status")
async def androidtv_adb_status():
    return await _adb_call(app_state.android_adb.status())


@router.post("/adb/connect")
async def androidtv_adb_connect(req: AndroidTvAdbConnectRequest):
    host = _validate_lan_ip(req.host)
    status = await _adb_call(app_state.android_adb.connect(host, req.port))
    await app_state.broadcast_state()
    return status


@router.post("/adb/pair")
async def androidtv_adb_pair(req: AndroidTvAdbPairRequest):
    host = _validate_lan_ip(req.host)
    try:
        status = await _adb_call(app_state.android_adb.pair(host, req.port, req.code.strip()))
        await app_state.broadcast_state()
        return status
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/adb/disconnect")
async def androidtv_adb_disconnect():
    status = await _adb_call(app_state.android_adb.disconnect(clear_host=True))
    await app_state.broadcast_state()
    return status


@router.get("/adb/diagnostics")
async def androidtv_adb_diagnostics():
    return await _adb_call(app_state.android_adb.diagnostics())


@router.get("/adb/current-app")
async def androidtv_adb_current_app():
    return await _adb_call(app_state.android_adb.current_app())


@router.get("/adb/apps")
async def androidtv_adb_apps():
    return {"apps": await _adb_call(app_state.android_adb.list_apps())}


@router.post("/adb/apps/launch")
async def androidtv_adb_launch_app(req: AndroidTvAdbAppRequest):
    return await _adb_call(app_state.android_adb.launch_app(req.package, req.activity))


@router.post("/adb/apps/force-stop")
async def androidtv_adb_force_stop_app(req: AndroidTvAdbAppRequest):
    return await _adb_call(app_state.android_adb.force_stop_app(req.package))


@router.post("/adb/apps/uninstall")
async def androidtv_adb_uninstall_app(req: AndroidTvAdbAppRequest):
    return await _adb_call(app_state.android_adb.uninstall_app(req.package))


@router.post("/adb/apps/favorite")
async def androidtv_adb_favorite(req: AndroidTvAdbFavoriteRequest):
    return await _adb_call(app_state.android_adb.set_favorite(req.package, req.favorite))


@router.post("/adb/text")
async def androidtv_adb_text(req: AndroidTvTextRequest):
    try:
        return await _adb_call(app_state.android_adb.send_text(req.text))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/adb/power")
async def androidtv_adb_power(req: AndroidTvAdbPowerRequest):
    try:
        return await _adb_call(app_state.android_adb.power_action(req.action))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.get("/adb/screenshot")
async def androidtv_adb_screenshot(
    format: Literal["png", "jpeg", "webp"] = Query("png"),
    max_width: int | None = Query(None, ge=240, le=3840),
    quality: int = Query(60, ge=30, le=95),
):
    data = await _adb_call(
        app_state.android_adb.screenshot(
            image_format=format,
            max_width=max_width,
            quality=quality,
        )
    )
    media_type = {
        "png": "image/png",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
    }[format]
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


def _validate_lan_ip(value: str) -> str:
    host = value.strip()
    ip_part = host.split("%", 1)[0]
    try:
        addr = ipaddress.ip_address(ip_part)
    except ValueError:
        raise HTTPException(400, "Invalid IP address")
    allowed = addr.is_private or addr.is_link_local
    if not allowed or addr.is_loopback or addr.is_multicast or addr.is_unspecified:
        raise HTTPException(400, "IP address not allowed (must be a local LAN IP)")
    return host


async def _adb_call(awaitable):
    try:
        return await awaitable
    except RuntimeError as exc:
        msg = str(exc)
        if "disabled" in msg.lower():
            raise HTTPException(403, msg)
        if "not connected" in msg.lower():
            raise HTTPException(503, msg)
        raise HTTPException(502, msg or "ADB command failed")


async def _try_adb_autoconnect(host: str) -> None:
    adb = app_state.android_adb
    if not adb.enabled:
        return
    saved = adb.load_last_host()
    port = saved[1] if saved and saved[0] == host else adb.default_port

    async def _connect() -> None:
        for attempt in range(1, 4):
            try:
                status = await adb.connect(host, port)
                if status.get("connected"):
                    await app_state.broadcast_state()
                    return
            except Exception as exc:
                _LOGGER.debug("ADB auto-connect to %s attempt %d failed: %s", host, attempt, exc)
            await asyncio.sleep(5)

    asyncio.create_task(_connect())
