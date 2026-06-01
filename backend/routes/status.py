"""Status, health, device info, discovery, and connection endpoints."""
from __future__ import annotations

import ipaddress
import logging

from fastapi import APIRouter, HTTPException

from api.models import (
    CommandRequest,
    DeviceInfoResponse,
    HealthResponse,
    PreferencesResponse,
    StatusResponse,
    ThemeConfig,
)
from preferences import load_preferences, save_preferences
from config import settings
from denon.const import CHANNEL_NAMES, DEFAULT_SOURCES, HEOS_SOURCES
from denon.discovery import discover_receivers
from state import app_state

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["status"])


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if (app_state.telnet and app_state.telnet.connected) else "degraded",
        telnet_connected=app_state.telnet.connected if app_state.telnet else False,
        receiver_ip=app_state.telnet.host if app_state.telnet else "0.0.0.0",
        receiver_power=app_state.telnet.state.get("power") if app_state.telnet else None,
        device_name=settings.denon_device_name,
        discovery_mode=not bool(settings.denon_host),
        discovering=app_state.discovering,
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
async def connect_to_receiver(req: CommandRequest):
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
        await app_state.connect_to_host(ip)
    except Exception as exc:
        _LOGGER.error("Connection failed to %s: %s", ip, exc)
        raise HTTPException(502, "Could not connect to receiver")

    return {"ok": True, "ip": ip}


@router.get("/status", response_model=StatusResponse)
async def status():
    if not app_state.telnet:
        raise HTTPException(503, "Not initialized")
    return StatusResponse(**app_state.build_status())


@router.get("/device", response_model=DeviceInfoResponse)
async def device_info():
    """Return device config (from env vars + telnet-discovered channels)."""
    # Merge sources: discovered from receiver (SSFUN) + env config overrides
    seen = set()
    sources = []

    # Start with receiver-discovered sources (preserves receiver order)
    for code, name in app_state.discovered_sources.items():
        # Env config overrides discovered display name
        display = app_state.source_name_cache.get(code, name)
        sources.append({"id": code, "name": display})
        seen.add(code)

    # Add any env-configured sources not discovered by the receiver
    for code, name in app_state.source_name_cache.items():
        if code not in seen:
            sources.append({"id": code, "name": name})
            seen.add(code)

    # Add HEOS / network sources (not reported by SSFUN ?)
    if settings.heos_sources:
        from denon.const import HEOS_REGION_SOURCES
        for code, name in HEOS_SOURCES.items():
            if code not in seen:
                # Skip region-locked sources not available on this receiver
                required_services = HEOS_REGION_SOURCES.get(code)
                if required_services and app_state.heos_available_services:
                    if not required_services & app_state.heos_available_services:
                        continue
                display = app_state.source_name_cache.get(code, name)
                sources.append({"id": code, "name": display})
                seen.add(code)

    # Also include current source if not in either map
    if app_state.telnet:
        for src_field in ("source", "z2_source"):
            src = app_state.telnet.state.get(src_field)
            if src and src not in seen:
                sources.append(
                    {"id": src, "name": DEFAULT_SOURCES.get(src, src)}
                )
                seen.add(src)

    # Filter out sources hidden on the receiver (SSSOD DEL)
    hidden = app_state.telnet.state.get("hidden_sources", set()) if app_state.telnet else set()
    if hidden:
        sources = [s for s in sources if s["id"] not in hidden]

    # Build channel names for active channels
    active_channels = {}
    if app_state.telnet:
        for ch in app_state.telnet.state.get("channel_volumes", {}):
            if ch in CHANNEL_NAMES:
                active_channels[ch] = CHANNEL_NAMES[ch]

    # Use receiver's friendly name if env var is still the default
    device_name = settings.denon_device_name
    if device_name == "Denon AVR" and app_state.telnet:
        discovered_name = app_state.telnet.state.get("friendly_name")
        if discovered_name:
            device_name = discovered_name

    return DeviceInfoResponse(
        device_name=device_name,
        zone1_name=settings.denon_zone1_name,
        zone2_name=settings.denon_zone2_name,
        sources=sources,
        source_name_map={**DEFAULT_SOURCES, **app_state.discovered_sources, **app_state.source_name_cache},
        channel_volumes=app_state.telnet.state.get("channel_volumes", {}) if app_state.telnet else {},
        channel_names=active_channels,
        receiver_ip=settings.denon_host,
        theme=settings.theme,
    )


@router.get("/channels")
async def channel_info():
    """Get available channels with names and current levels."""
    if not app_state.telnet:
        raise HTTPException(503, "Not initialized")
    cvs = app_state.telnet.state.get("channel_volumes", {})
    return {
        ch: {"name": CHANNEL_NAMES.get(ch, ch), "level": lvl}
        for ch, lvl in cvs.items()
    }


@router.post("/command")
async def raw_command(req: CommandRequest):
    if not app_state.telnet:
        raise HTTPException(503, "Not connected")
    ok = await app_state.telnet.send(req.command)
    if not ok:
        raise HTTPException(502, "Failed to send command")
    return {"ok": True}


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences():
    """Return current user preferences (theme config)."""
    prefs = load_preferences()
    return PreferencesResponse(theme=ThemeConfig(**prefs.get("theme", {})))


@router.post("/preferences/theme")
async def save_theme(req: ThemeConfig):
    """Save theme config server-side and broadcast to all connected WebSocket clients."""
    prefs = load_preferences()
    prefs["theme"] = req.model_dump()
    try:
        save_preferences(prefs)
    except Exception:
        raise HTTPException(500, "Failed to save preferences — check that the /data volume is mounted")
    app_state.theme_config = req.model_dump()
    await app_state.broadcast_state()
    return {"ok": True}


@router.post("/refresh")
async def refresh_status():
    if not app_state.telnet:
        raise HTTPException(503, "Not connected")
    await app_state.telnet.refresh()
    return {"ok": True}
