"""Denon Dashboard — FastAPI backend."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import urllib.parse
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from denon.const import COMMAND_RE
from denon.discovery import discover_receivers
from night_mode import reconcile_night_mode_schedule
from radio_service import cancel_preload, ensure_radio_preload
from routes import audio, media, metrics, power, radio, status, volume, zone2
from state import app_state

# ---- Logging ----
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
_LOGGER = logging.getLogger("denon_dashboard")

# ---- WebSocket limits ----
MAX_WS_CLIENTS = 20
WS_MSG_RATE_LIMIT = 10  # max messages per second per client
MEDIA_RESYNC_INTERVAL = 30  # seconds between HEOS media-state safety re-polls
CALIBRATION_RESYNC_INTERVAL = 300  # seconds between Audyssey calibration re-fetches


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


NIGHT_MODE_TICK_INTERVAL = 30  # seconds between Night Mode schedule checks


async def _run_periodic(name: str, interval: float, tick) -> None:
    """Run ``tick()`` every ``interval`` seconds until cancelled.

    A failing tick is logged at WARNING with the loop name and never ends the
    loop (these failures used to vanish at DEBUG).
    """
    while True:
        await asyncio.sleep(interval)
        try:
            await tick()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LOGGER.warning("%s tick failed: %s", name, exc)


async def _media_tick() -> None:
    """Re-poll HEOS now-playing/play-state.

    Change events are the primary path; this is the backstop for the case where
    they stop arriving without any error surfacing (silent re-registration failure
    after a HEOS socket drop).
    """
    if await app_state.refresh_media_state():
        await app_state.broadcast_state()
    # Covers the AVR-in-standby-at-startup case: a preload skipped because HEOS
    # was down is retried here. No HEOS check needed: the preload finds HEOS
    # down itself and backs off (1 -> 30 min); this is a no-op once cached or
    # while backing off.
    ensure_radio_preload()


async def _calibration_tick() -> None:
    """Re-fetch the Audyssey calibration offsets.

    There is no telnet event for them, so without this the offsets stay at whatever
    they were when the dashboard connected — a re-run of Audyssey or a level edit in
    the receiver's setup menu never reaches the UI, and the displayed dB
    (calibration + trim) stays wrong indefinitely.
    """
    if await app_state.refresh_speaker_calibration():
        await app_state.broadcast_state(force=True)


async def _night_mode_tick() -> None:
    await reconcile_night_mode_schedule()


# ---- Lifespan ----

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Build source name cache from env config
    app_state.source_name_cache = dict(settings.denon_source_names)
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
    night_mode_task: asyncio.Task = asyncio.create_task(
        _run_periodic("Night mode scheduler", NIGHT_MODE_TICK_INTERVAL, _night_mode_tick)
    )
    media_resync_task: asyncio.Task = asyncio.create_task(
        _run_periodic("Media state resync", MEDIA_RESYNC_INTERVAL, _media_tick)
    )
    calibration_task: asyncio.Task = asyncio.create_task(
        _run_periodic("Calibration resync", CALIBRATION_RESYNC_INTERVAL, _calibration_tick)
    )

    host = settings.denon_host
    if settings.demo_mode:
        _LOGGER.info("Demo mode enabled — using mock receiver (no real AVR needed)")
        await app_state.start_demo()
    elif host:
        _LOGGER.info("Connecting to configured host %s...", host)
        await app_state.connect_to_host(host)  # starts the radio preload itself
    else:
        bg_task = asyncio.create_task(_auto_discover_and_connect())

    yield

    # Graceful shutdown: cancel background tasks
    await cancel_preload()
    for task in (bg_task, night_mode_task, media_resync_task, calibration_task):
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
    description="Control API for Denon/Marantz AVR receivers (telnet + HEOS CLI)",
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
app.include_router(radio.router)
app.include_router(status.router)
# Root-level /metrics — must be registered before the catch-all static mount.
app.include_router(metrics.router)


# ---- WebSocket ----

def _ws_origin_allowed(origin: str, host: str) -> bool:
    if not origin:
        return True
    try:
        parsed = urllib.parse.urlparse(origin)
    except Exception:
        return False
    if not parsed.netloc:
        return False
    if cors_origins:
        return f"{parsed.scheme}://{parsed.netloc}" in cors_origins
    return parsed.netloc.lower() == host.lower()


@app.websocket("/api/v1/ws")
async def websocket_endpoint(ws: WebSocket):
    # Validate Origin to prevent Cross-Site WebSocket Hijacking (CSWSH).
    # With CORS_ORIGINS set, the Origin must be one of them. Without it, the
    # Origin's host:port must equal the request Host (same-origin). An empty
    # Origin stays allowed: non-browser clients (HA, curl) send none.
    if not _ws_origin_allowed(ws.headers.get("origin", ""), ws.headers.get("host", "")):
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
        # Send current state immediately, connected or not: the client needs
        # one frame to leave its "connecting" state.
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
            except json.JSONDecodeError:
                continue
            if not isinstance(msg, dict):
                continue  # valid JSON but not {"command": ...}
            cmd = msg.get("command")
            # Early reject here even though send() validates again: a junk
            # frame should not reach the telnet client at all.
            if isinstance(cmd, str) and COMMAND_RE.fullmatch(cmd) and app_state.telnet:
                await app_state.telnet.send(cmd)
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

if os.path.isdir(settings.static_dir):
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
