"""Status, health, device info, discovery, and connection endpoints."""
from __future__ import annotations

import ipaddress
import logging
import re

from fastapi import APIRouter, HTTPException, Depends

from api.models import (
    CommandRequest,
    DeviceInfoResponse,
    HealthResponse,
    SourceNameRequest,
    StatusResponse,
    TimeSettingsResponse,
    UiEffectsResponse,
    UiSettingsRequest,
)
from config import settings
from denon.const import CHANNEL_NAMES, DEFAULT_SOURCES, HEOS_SOURCES
from denon.discovery import discover_receivers
from state import AppState
from dependencies import get_app_state

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
        raise HTTPException(500, "Discovery failed")


@router.post("/connect")
async def connect_to_receiver(req: CommandRequest, state: AppState = Depends(get_app_state)):
    """Connect (or reconnect) to a receiver IP. Uses 'command' field as the IP."""
    ip = req.command.strip()
    if not ip:
        raise HTTPException(400, "IP address required")

    # Validate IP address and reject dangerous/external targets
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        raise HTTPException(400, "Invalid IP address")
    if not addr.is_private or addr.is_loopback or addr.is_link_local:
        raise HTTPException(400, "IP address not allowed (must be a private LAN IP)")

    _LOGGER.info("Connecting to receiver at %s", ip)

    try:
        await state.connect_to_host(ip)
    except Exception as exc:
        _LOGGER.error("Connection failed to %s: %s", ip, exc)
        raise HTTPException(502, "Could not connect to receiver")

    return {"ok": True, "ip": ip}


@router.get("/status", response_model=StatusResponse)
async def status(state: AppState = Depends(get_app_state)):
    if not state.telnet:
        raise HTTPException(503, "Not initialized")
    return StatusResponse(**state.build_status())


@router.get("/device", response_model=DeviceInfoResponse)
async def device_info(state: AppState = Depends(get_app_state)):
    """Return device config (from env vars + telnet-discovered channels)."""
    # Merge sources: discovered from receiver (SSFUN) + env config overrides
    seen = set()
    sources = []

    # Start with receiver-discovered sources (preserves receiver order)
    for code, name in state.discovered_sources.items():
        # Persisted UI overrides > env config > discovered display name
        display = state.source_name_overrides.get(
            code, state.source_name_cache.get(code, name)
        )
        sources.append({"id": code, "name": display})
        seen.add(code)

    # Add any env-configured sources not discovered by the receiver
    for code, name in state.source_name_cache.items():
        if code not in seen:
            sources.append({
                "id": code,
                "name": state.source_name_overrides.get(code, name),
            })
            seen.add(code)

    # Add HEOS / network sources (not reported by SSFUN ?)
    if settings.heos_sources:
        from denon.const import HEOS_REGION_SOURCES
        for code, name in HEOS_SOURCES.items():
            if code not in seen:
                # Skip region-locked sources not available on this receiver
                required_services = HEOS_REGION_SOURCES.get(code)
                if required_services and state.heos_available_services:
                    if not required_services & state.heos_available_services:
                        continue
                display = state.source_name_overrides.get(
                    code, state.source_name_cache.get(code, name)
                )
                sources.append({"id": code, "name": display})
                seen.add(code)

    # Also include current source if not in either map
    if state.telnet:
        for src_field in ("source", "z2_source"):
            src = state.telnet.state.get(src_field)
            if src and src not in seen:
                sources.append(
                    {"id": src, "name": state.resolve_source_name(src) or src}
                )
                seen.add(src)

    # Filter out sources hidden on the receiver (SSSOD DEL)
    hidden = state.telnet.state.get("hidden_sources", set()) if state.telnet else set()
    if hidden:
        sources = [s for s in sources if s["id"] not in hidden]

    # Build channel names for active channels
    active_channels = {}
    if state.telnet:
        for ch in state.telnet.state.get("channel_volumes", {}):
            if ch in CHANNEL_NAMES:
                active_channels[ch] = CHANNEL_NAMES[ch]

    # Use receiver's friendly name if env var is still the default
    device_name = settings.denon_device_name
    if device_name == "Denon AVR" and state.telnet:
        discovered_name = state.telnet.state.get("friendly_name")
        if discovered_name:
            device_name = discovered_name

    persisted_theme = state.ui_settings.get("theme")
    time_format = settings.time_format if settings.time_format in ("auto", "24h", "12h") else "auto"

    return DeviceInfoResponse(
        device_name=device_name,
        zone1_name=settings.denon_zone1_name,
        zone2_name=settings.denon_zone2_name,
        sources=sources,
        source_name_map={
            **DEFAULT_SOURCES,
            **state.discovered_sources,
            **state.source_name_cache,
            **state.source_name_overrides,
        },
        source_name_overrides=state.source_name_overrides,
        channel_volumes=state.telnet.state.get("channel_volumes", {}) if state.telnet else {},
        channel_names=active_channels,
        receiver_ip=settings.denon_host,
        theme=persisted_theme or settings.theme,
        ui_effects=UiEffectsResponse(
            ambient_background=settings.ui_ambient_background,
            seasonal_effects=settings.ui_seasonal_effects,
            shortcut_overlay=settings.ui_shortcut_overlay,
            card_animations=settings.ui_card_animations,
            ambient_intensity=settings.ui_ambient_intensity,
        ),
        time_settings=TimeSettingsResponse(
            timezone=settings.timezone,
            time_format=time_format,
        ),
        night_mode_config=state.night_mode_config,
        radio_favorites=state.radio_favorites,
    )


@router.post("/source-names/{source_code}")
async def set_source_name(source_code: str, req: SourceNameRequest, state: AppState = Depends(get_app_state)):
    code = source_code.strip().upper()
    if not code or not re.fullmatch(r"[A-Z0-9/]{1,10}", code):
        raise HTTPException(400, "Invalid source code")
    state.set_source_name_override(code, req.name)
    await state.broadcast_state()
    return {"ok": True, "source": code, "name": req.name.strip()}


@router.delete("/source-names/{source_code}")
async def reset_source_name(source_code: str, state: AppState = Depends(get_app_state)):
    code = source_code.strip().upper()
    if not code or not re.fullmatch(r"[A-Z0-9/]{1,10}", code):
        raise HTTPException(400, "Invalid source code")
    state.reset_source_name_override(code)
    await state.broadcast_state()
    return {"ok": True, "source": code, "name": state.resolve_source_name(code)}


@router.post("/ui-settings")
async def set_ui_settings(req: UiSettingsRequest, state: AppState = Depends(get_app_state)):
    updates = {}
    # Keep validation local to avoid coupling backend to frontend theme module.
    allowed_themes = {"gold", "blue", "red", "green", "olive", "violet", "purple", "pink", "orange"}
    if req.theme is not None:
        if req.theme not in allowed_themes:
            raise HTTPException(400, "Invalid theme")
        updates["theme"] = req.theme
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
    if not state.telnet:
        raise HTTPException(503, "Not connected")
    ok = await state.telnet.send(req.command)
    if not ok:
        raise HTTPException(502, "Failed to send command")
    return {"ok": True}


@router.post("/refresh")
async def refresh_status(state: AppState = Depends(get_app_state)):
    if not state.telnet:
        raise HTTPException(503, "Not connected")
    await state.telnet.refresh()
    return {"ok": True}

