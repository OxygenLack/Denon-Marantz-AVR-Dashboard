"""Status, health, device info, discovery, and connection endpoints."""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException

from api.models import (
    CommandRequest,
    ConnectRequest,
    DeviceInfoResponse,
    HealthResponse,
    NightModeConfigRequest,
    SourceEntry,
    SourceNameRequest,
    StatusResponse,
    SurroundCategory,
    TimeSettingsResponse,
    UiEffectsResponse,
    UiSettingsRequest,
)
from calibration import is_private_host
from config import settings
from denon.const import (
    CHANNEL_NAMES,
    DEFAULT_SOURCES,
    HEOS_REGION_SOURCES,
    HEOS_SOURCES,
    MEDIA_INPUT_SOURCES,
    SOURCE_CODE_PATTERN,
    SURROUND_CATEGORIES,
    SURROUND_CATEGORY_COMMANDS,
    SURROUND_MODES,
)
from denon.discovery import discover_receivers
from dependencies import get_app_state
from routes._helpers import require_telnet, send_command
from state import AppState

_SOURCE_CODE_RE = re.compile(SOURCE_CODE_PATTERN)

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["status"])


@router.get("/health", response_model=HealthResponse)
async def health(state: AppState = Depends(get_app_state)):
    return HealthResponse(
        status="ok" if (state.telnet and state.telnet.connected) else "degraded",
        telnet_connected=state.telnet.connected if state.telnet else False,
        receiver_ip=state.telnet.host if state.telnet else "0.0.0.0",
        receiver_power=state.telnet.state.get("power") if state.telnet else None,
        device_name=settings.denon_device_name,
        discovery_mode=not bool(settings.denon_host),
        discovering=state.discovering,
    )


@router.get("/discover")
async def discover_endpoint():
    """Scan the local network for Denon/Marantz AVR receivers via SSDP."""
    try:
        devices = await discover_receivers(timeout=4.0)
        return {"devices": devices}
    except Exception as exc:
        _LOGGER.error("Discovery error: %s", exc)
        raise HTTPException(500, "Discovery failed") from exc


@router.post("/connect")
async def connect_to_receiver(req: ConnectRequest, state: AppState = Depends(get_app_state)):
    """Connect (or reconnect) to a receiver IP (body: ``{"host": "<ip>"}``)."""
    # Validate IP address and reject dangerous/external targets
    addr = is_private_host(req.host)
    if addr is None:
        raise HTTPException(400, "IP address not allowed (must be a private LAN IP)")
    ip = str(addr)

    _LOGGER.info("Connecting to receiver at %s", ip)

    try:
        await state.connect_to_host(ip)
    except Exception as exc:
        _LOGGER.error("Connection failed to %s: %s", ip, exc)
        raise HTTPException(502, "Could not connect to receiver") from exc

    return {"ok": True, "ip": ip}


@router.get("/status", response_model=StatusResponse)
async def status(state: AppState = Depends(get_app_state)):
    if not state.telnet:
        raise HTTPException(503, "Not initialized")
    return StatusResponse(**state.build_status())


@router.get("/device", response_model=DeviceInfoResponse)
async def device_info(state: AppState = Depends(get_app_state)):
    """Return device config (from env vars + telnet-discovered channels).

    Home Assistant reads this endpoint too: fields may only be added.
    """
    telnet = state.telnet
    discovered = state.discovered_sources
    seen: set[str] = set()
    sources: list[SourceEntry] = []

    def add(code: str, fallback: str) -> None:
        # default_name: env config > receiver/built-in name; the persisted
        # UI rename only changes `name`.
        default = state.source_name_cache.get(code, fallback)
        sources.append(SourceEntry(
            id=code,
            name=state.source_name_overrides.get(code, default),
            default_name=default,
        ))
        seen.add(code)

    # Receiver-discovered sources first (preserves receiver order)
    for code, name in discovered.items():
        add(code, name)

    # Env-configured sources the receiver did not report
    for code, name in state.source_name_cache.items():
        if code not in seen:
            add(code, name)

    # HEOS / network sources (not reported by SSFUN ?)
    if settings.heos_sources:
        for code, name in HEOS_SOURCES.items():
            if code in seen:
                continue
            # Skip region-locked sources not available on this receiver
            required_services = HEOS_REGION_SOURCES.get(code)
            if (
                required_services
                and state.heos_available_services
                and not required_services & state.heos_available_services
            ):
                continue
            add(code, name)

    # Also include the current sources if not in any map
    if telnet:
        for src_field in ("source", "z2_source"):
            src = telnet.state.get(src_field)
            if src and src not in seen:
                add(src, discovered.get(src) or DEFAULT_SOURCES.get(src, src))

    # Filter out sources hidden on the receiver (SSSOD DEL)
    hidden = telnet.state.get("hidden_sources", set()) if telnet else set()
    if hidden:
        sources = [s for s in sources if s.id not in hidden]

    # Channel names for the active channels, in canonical speaker order
    channel_volumes = telnet.state.get("channel_volumes", {}) if telnet else {}
    channel_names = {ch: name for ch, name in CHANNEL_NAMES.items() if ch in channel_volumes}

    # Use receiver's friendly name if env var is still the default
    device_name = settings.denon_device_name
    if device_name == "Denon AVR" and telnet:
        discovered_name = telnet.state.get("friendly_name")
        if discovered_name:
            device_name = discovered_name

    return DeviceInfoResponse(
        device_name=device_name,
        zone1_name=settings.denon_zone1_name,
        zone2_name=settings.denon_zone2_name,
        sources=sources,
        source_name_map={
            **DEFAULT_SOURCES,
            **discovered,
            **state.source_name_cache,
            **state.source_name_overrides,
        },
        source_name_overrides=state.source_name_overrides,
        channel_volumes=channel_volumes,
        channel_names=channel_names,
        # Connected-or-configured host; null when there is neither, so the
        # setup screen can tell "no host" from "connect failed".
        receiver_ip=state.receiver_host or settings.denon_host or None,
        theme=state.ui_settings.get("theme") or settings.theme,
        ui_effects=UiEffectsResponse(
            ambient_background=settings.ui_ambient_background,
            seasonal_effects=settings.ui_seasonal_effects,
            shortcut_overlay=settings.ui_shortcut_overlay,
            card_animations=settings.ui_card_animations,
            ambient_intensity=settings.ui_ambient_intensity,
        ),
        time_settings=TimeSettingsResponse(
            timezone=settings.timezone,
            time_format=settings.time_format,
        ),
        night_mode_config=NightModeConfigRequest.model_validate(state.night_mode_config),
        radio_favorites=state.radio_favorites,
        media_sources=sorted(HEOS_SOURCES) + list(MEDIA_INPUT_SOURCES),
        surround_categories=[
            SurroundCategory(code=code, label=label, command=SURROUND_CATEGORY_COMMANDS[code])
            for code, label in SURROUND_CATEGORIES.items()
        ],
        surround_modes=list(SURROUND_MODES),
    )


@router.post("/source-names/{source_code}")
async def set_source_name(source_code: str, req: SourceNameRequest, state: AppState = Depends(get_app_state)):
    code = source_code.strip().upper()
    if not _SOURCE_CODE_RE.match(code):
        raise HTTPException(400, "Invalid source code")
    state.set_source_name_override(code, req.name)
    await state.broadcast_state()
    return {"ok": True, "source": code, "name": req.name.strip()}


@router.delete("/source-names/{source_code}")
async def reset_source_name(source_code: str, state: AppState = Depends(get_app_state)):
    code = source_code.strip().upper()
    if not _SOURCE_CODE_RE.match(code):
        raise HTTPException(400, "Invalid source code")
    state.reset_source_name_override(code)
    await state.broadcast_state()
    return {"ok": True, "source": code, "name": state.resolve_source_name(code)}


@router.post("/ui-settings")
async def set_ui_settings(req: UiSettingsRequest, state: AppState = Depends(get_app_state)):
    # The model validates the theme name (unknown names are a 422).
    updates = {"theme": req.theme} if req.theme is not None else {}
    state.update_ui_settings(updates)
    # Push the new theme to every connected client so theme changes sync live
    # across devices (theme is part of the broadcast state payload).
    await state.broadcast_state(force=True)
    return {"ok": True, "ui_settings": state.ui_settings}


@router.get("/channels")
async def channel_info(state: AppState = Depends(get_app_state)):
    """Get available channels with names and current levels."""
    if not state.telnet:
        raise HTTPException(503, "Not initialized")
    cvs = state.telnet.state.get("channel_volumes", {})
    return {
        ch: {"name": CHANNEL_NAMES.get(ch, ch), "level": lvl}
        for ch, lvl in cvs.items()
    }


@router.post("/command")
async def raw_command(req: CommandRequest, state: AppState = Depends(get_app_state)):
    return await send_command(state, req.command)


@router.post("/refresh")
async def refresh_status(state: AppState = Depends(get_app_state)):
    await require_telnet(state).refresh()
    return {"ok": True}

