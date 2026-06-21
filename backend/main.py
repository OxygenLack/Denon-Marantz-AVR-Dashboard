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
import urllib.parse

from config import settings
from denon.const import COMMAND_PATTERN
from denon.discovery import discover_receivers
from night_mode import reconcile_night_mode_schedule
from routes import power, volume, audio, zone2, media, status
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


async def _night_mode_scheduler() -> None:
    while True:
        try:
            await asyncio.sleep(30)
            await reconcile_night_mode_schedule()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LOGGER.debug("Night mode scheduler error: %s", exc)


# ---- Lifespan ----

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build source name cache from env config
    app_state.source_name_cache = settings.source_name_map.copy()
    app_state.load_source_name_overrides()
    app_state.load_ui_settings()
    app_state.load_night_mode_config()
    app_state.load_radio_favorites()
    _LOGGER.info(
        "Configured %d custom source names: %s",
        len(app_state.source_name_cache),
        list(app_state.source_name_cache.keys()),
    )
    _LOGGER.info(
        "Loaded %d persisted source name overrides from %s",
        len(app_state.source_name_overrides),
        app_state.source_name_overrides_path,
    )
    _LOGGER.info(
        "Loaded %d persisted UI settings from %s",
        len(app_state.ui_settings),
        app_state.ui_settings_path,
    )
    _LOGGER.info(
        "Loaded %d radio favorites and %d night mode channels",
        len(app_state.radio_favorites),
        len(app_state.night_mode_config.get("channels", [])),
    )

    # Track background tasks for graceful shutdown
    bg_task: asyncio.Task | None = None
    night_mode_task: asyncio.Task | None = asyncio.create_task(_night_mode_scheduler())

    host = settings.denon_host
    if host:
        _LOGGER.info("Connecting to configured host %s...", host)
        await app_state.connect_to_host(host)
        # Preload radio stations in background
        from routes.media import preload_radio_stations
        bg_task = asyncio.create_task(preload_radio_stations())
    else:
        bg_task = asyncio.create_task(_auto_discover_and_connect())

    yield

    # Graceful shutdown: cancel background tasks
    for task in (bg_task, night_mode_task):
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    if app_state.heos:
        await app_state.heos.disconnect()
    if app_state.telnet:
        await app_state.telnet.disconnect()


# ---- App ----

app = FastAPI(
    title="Denon Dashboard API",
    version="1.0.0",
    description="Control API for Denon AVR receivers (telnet-only)",
    lifespan=lifespan,
)

# Security headers (Pure ASGI Middleware)
class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        # The service worker is a kill-switch (unregisters itself). It must
        # never be cached, or stuck clients can't pick up the new SW.
        is_sw = path == "/sw.js"

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
                    (b"content-security-policy", b"default-src 'self'; img-src 'self' http: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'none'")
                ])
                if is_sw:
                    headers.append((b"cache-control", b"no-cache, no-store, must-revalidate"))
            await send(message)

        await self.app(scope, receive, send_wrapper)

app.add_middleware(SecurityHeadersMiddleware)

# CORS — configurable via DENON_DASHBOARD_CORS_ORIGINS (empty = same-origin only).
# Each entry must be a full scheme://host[:port] URL. Wildcard '*' is rejected
# because it would also bypass the WebSocket Origin check below.
def _parse_cors_origins(raw: str) -> list[str]:
    result: list[str] = []
    for entry in (o.strip() for o in raw.split(",")):
        if not entry:
            continue
        if entry == "*":
            _LOGGER.warning("CORS wildcard '*' rejected; specify explicit origins")
            continue
        parsed = urllib.parse.urlparse(entry)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            _LOGGER.warning("Ignoring malformed CORS origin: %s", entry)
            continue
        result.append(f"{parsed.scheme}://{parsed.netloc}")
    return result


cors_origins = _parse_cors_origins(settings.cors_origins)
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


# ---- WebSocket ----

@app.websocket("/api/v1/ws")
async def websocket_endpoint(ws: WebSocket):
    # Validate Origin to prevent Cross-Site WebSocket Hijacking (CSWSH)
    origin = ws.headers.get("origin", "")
    if cors_origins and "*" not in cors_origins:
        allowed = False
        if origin:
            try:
                parsed_origin = urllib.parse.urlparse(origin)
                # Reconstruct scheme://netloc for strict matching without trailing paths
                origin_host = f"{parsed_origin.scheme}://{parsed_origin.netloc}"
                allowed = origin_host in cors_origins
            except Exception:
                pass
        else:
            allowed = True  # allow empty origin (non-browser clients)
            
        if not allowed:
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
        if app_state.telnet:
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
