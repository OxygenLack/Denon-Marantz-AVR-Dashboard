"""Denon Dashboard — FastAPI backend."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from config import settings
from denon.const import COMMAND_PATTERN
from denon.discovery import discover_receivers
from routes import power, volume, audio, zone2, media, status, androidtv
from state import app_state

# ---- Logging ----
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
_LOGGER = logging.getLogger("denon_dashboard")

# Compiled command regex from shared constant
_COMMAND_RE = re.compile(COMMAND_PATTERN)

# ---- WebSocket limits ----
MAX_WS_CLIENTS = 20
WS_MSG_RATE_LIMIT = 10  # max messages per second per client


# ---- Background discovery ----

async def _auto_discover_and_connect() -> None:
    """Background task: discover receiver and connect. Retries every 30s until found."""
    _LOGGER.info("No DENON_DASHBOARD_DENON_HOST set — starting auto-discovery in background...")
    while True:
        app_state.discovering = True
        await app_state.broadcast_state()
        try:
            devices = await discover_receivers(timeout=5.0)
            if devices:
                host = devices[0]["ip"]
                _LOGGER.info("Auto-discovered receiver at %s (%s)", host, devices[0].get("model"))
                app_state.discovering = False
                await app_state.connect_to_host(host)
                return  # success — stop retrying
            else:
                _LOGGER.warning("Auto-discovery found no receivers — retrying in 30s")
        except Exception as exc:
            _LOGGER.error("Auto-discovery error: %s — retrying in 30s", exc)
        app_state.discovering = False
        await app_state.broadcast_state()
        await asyncio.sleep(30)


async def _auto_connect_adb(host: str, port: int) -> None:
    """Background task: connect ADB with retries after Android TV startup."""
    if not settings.android_tv_adb_enabled:
        return
    for attempt in range(1, 13):
        try:
            _LOGGER.info(
                "Connecting to Android TV ADB host %s:%s (attempt %d/12)...",
                host,
                port,
                attempt,
            )
            status = await app_state.android_adb.connect(host, port)
            if status.get("connected"):
                _LOGGER.info("Android TV ADB connected to %s:%s", host, port)
                await app_state.broadcast_state()
                return
            _LOGGER.warning(
                "Android TV ADB connect returned state=%s",
                status.get("state") or "unknown",
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            _LOGGER.warning(
                "Android TV ADB auto-connect attempt %d/12 failed: %s",
                attempt,
                message,
            )
        await asyncio.sleep(10)
    _LOGGER.warning("Android TV ADB auto-connect gave up for %s:%s", host, port)


# ---- Lifespan ----

@asynccontextmanager
async def lifespan(app: FastAPI):
    from preferences import load_preferences
    prefs = load_preferences()
    app_state.theme_config = prefs.get("theme", {"base": "gold", "overrides": {}})

    # Build source name cache from env config
    app_state.source_name_cache = settings.source_name_map.copy()
    _LOGGER.info(
        "Configured %d custom source names: %s",
        len(app_state.source_name_cache),
        list(app_state.source_name_cache.keys()),
    )

    # Track background tasks for graceful shutdown
    bg_task: asyncio.Task | None = None
    adb_task: asyncio.Task | None = None

    host = settings.denon_host
    if settings.demo_mode:
        _LOGGER.info("Demo mode enabled — using mock receiver (no real AVR needed)")
        await app_state.start_demo()
    elif host:
        _LOGGER.info("Connecting to configured host %s...", host)
        await app_state.connect_to_host(host)
        # Preload radio stations in background
        from routes.media import preload_radio_stations
        bg_task = asyncio.create_task(preload_radio_stations())
    else:
        bg_task = asyncio.create_task(_auto_discover_and_connect())

    android_tv_host = settings.android_tv_host or app_state.android_tv.load_last_host()
    if android_tv_host:
        _LOGGER.info("Connecting to Android TV host %s...", android_tv_host)
        await app_state.android_tv.connect(android_tv_host)

    adb_last_host = app_state.android_adb.load_last_host()
    if settings.android_tv_adb_enabled and (adb_last_host or android_tv_host):
        adb_host, adb_port = adb_last_host or (android_tv_host, settings.android_tv_adb_port)
        adb_task = asyncio.create_task(_auto_connect_adb(adb_host, adb_port))

    yield

    # Graceful shutdown: cancel background tasks
    if bg_task and not bg_task.done():
        bg_task.cancel()
        try:
            await bg_task
        except asyncio.CancelledError:
            pass
    if adb_task and not adb_task.done():
        adb_task.cancel()
        try:
            await adb_task
        except asyncio.CancelledError:
            pass
    if app_state.heos:
        await app_state.heos.disconnect()
    if app_state.telnet:
        await app_state.telnet.disconnect()
    await app_state.android_tv.disconnect()
    await app_state.android_adb.disconnect()


# ---- App ----

app = FastAPI(
    title="Denon Dashboard API",
    version="1.0.0",
    description="Control API for Denon AVR receivers (telnet-only)",
    lifespan=lifespan,
)

# Security headers
class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' blob: data: http: https:; "
            "style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none'"
        )
        return response

app.add_middleware(_SecurityHeadersMiddleware)

# CORS — configurable via DENON_DASHBOARD_CORS_ORIGINS (empty = same-origin only)
cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

# ---- Include routers ----
app.include_router(power.router)
app.include_router(volume.router)
app.include_router(audio.router)
app.include_router(zone2.router)
app.include_router(media.router)
app.include_router(status.router)
app.include_router(androidtv.router)


# ---- WebSocket ----

@app.websocket("/api/v1/ws")
async def websocket_endpoint(ws: WebSocket):
    # Validate Origin to prevent Cross-Site WebSocket Hijacking (CSWSH)
    origin = ws.headers.get("origin", "")
    if cors_origins and "*" not in cors_origins:
        allowed = any(origin == o or origin.startswith(o) for o in cors_origins)
        if not allowed and origin:  # allow empty origin (non-browser clients)
            await ws.close(code=4003, reason="Origin not allowed")
            return

    # Enforce max client cap
    if len(app_state.ws_clients) >= MAX_WS_CLIENTS:
        await ws.close(code=4008, reason="Too many clients")
        return

    await ws.accept()
    app_state.ws_clients.add(ws)
    _LOGGER.info("WebSocket client connected (%d total)", len(app_state.ws_clients))
    try:
        # Send current state immediately
        await ws.send_text(json.dumps(app_state.build_status()))

        # Per-client rate limiting state
        msg_times: list[float] = []

        # Keep alive and handle incoming commands
        while True:
            data = await ws.receive_text()

            # Rate limit: max WS_MSG_RATE_LIMIT messages per second
            now = time.monotonic()
            msg_times = [t for t in msg_times if now - t < 1.0]
            if len(msg_times) >= WS_MSG_RATE_LIMIT:
                _LOGGER.debug("WebSocket rate limit exceeded, dropping message")
                continue
            msg_times.append(now)

            try:
                msg = json.loads(data)
                cmd = msg.get("command")
                if cmd and app_state.telnet:
                    if isinstance(cmd, str) and _COMMAND_RE.fullmatch(cmd):
                        await app_state.telnet.send(cmd)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        _LOGGER.debug("WebSocket error: %s", exc)
    finally:
        app_state.ws_clients.discard(ws)
        _LOGGER.info(
            "WebSocket client disconnected (%d remaining)", len(app_state.ws_clients)
        )


# ---- Static files (served last, catches all non-API routes) ----

_STATIC_DIR = os.environ.get("STATIC_DIR", "/app/static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
