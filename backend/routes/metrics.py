"""Prometheus exposition endpoint.

Hand-rolled on purpose: the whole surface is a dozen gauges and one counter, and
`security:backend` (pip-audit, no --ignore-unfixed) blocks the image build on ANY
dependency CVE. A client library for this would trade 40 lines of formatting for a
recurring reason not to be able to ship.

Mounted at the app root, not under /api/v1, because that is where every scraper
looks by default.
"""
from __future__ import annotations

import asyncio
import os
import time

from fastapi import APIRouter, Depends, Response

import radio_service
from config import settings
from dependencies import get_app_state
from state import AppState

router = APIRouter(tags=["metrics"])

CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"

# Process start. Uptime is time() - this, computed at query time in PromQL, which
# is the convention (a self-reported uptime gauge lies across a clock change).
_START_TIME = time.time()


def _fmt(value: float | int | bool) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _escape_label(value: str) -> str:
    """Escape a label value per the exposition format (backslash, quote, newline).

    `device_name` is user-supplied via env; an unescaped quote in it would emit a
    line no scraper can parse and take the whole endpoint down with it.
    """
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _resident_memory_bytes() -> int | None:
    """Process RSS from /proc/self/statm (Linux). None where /proc is unavailable.

    Field 2 of statm is resident pages. No psutil: see the module docstring.
    """
    try:
        with open("/proc/self/statm") as fh:
            fields = fh.read().split()
        return int(fields[1]) * os.sysconf("SC_PAGE_SIZE")
    except (OSError, IndexError, ValueError):
        return None


class _Registry:
    """Minimal text-format builder. Emits HELP/TYPE exactly once per metric."""

    def __init__(self) -> None:
        self._lines: list[str] = []

    def gauge(self, name: str, help_text: str, value: float | int | bool | None) -> None:
        # None means "unknown" (receiver never reported it). Omitting the series is
        # honest; emitting 0 would make a receiver that never answered look muted,
        # powered off and at volume 0.
        if value is None:
            return
        self._lines.append(f"# HELP {name} {help_text}")
        self._lines.append(f"# TYPE {name} gauge")
        self._lines.append(f"{name} {_fmt(value)}")

    def counter(self, name: str, help_text: str, value: float | int) -> None:
        self._lines.append(f"# HELP {name} {help_text}")
        self._lines.append(f"# TYPE {name} counter")
        self._lines.append(f"{name} {_fmt(value)}")

    def info(self, name: str, help_text: str, labels: dict[str, str]) -> None:
        rendered = ",".join(
            f'{key}="{_escape_label(value)}"' for key, value in sorted(labels.items())
        )
        self._lines.append(f"# HELP {name} {help_text}")
        self._lines.append(f"# TYPE {name} gauge")
        self._lines.append(f"{name}{{{rendered}}} 1")

    def render(self) -> str:
        return "\n".join(self._lines) + "\n"


@router.get("/metrics", include_in_schema=False)
async def metrics(state: AppState = Depends(get_app_state)) -> Response:
    reg = _Registry()
    telnet = state.telnet
    link = telnet.link_status if telnet is not None else {}
    receiver = telnet.state if telnet is not None else {}

    # -- the dashboard itself --
    reg.gauge(
        "denon_dashboard_start_timestamp_seconds",
        "Unix timestamp at which this backend process started.",
        _START_TIME,
    )
    reg.gauge(
        "denon_dashboard_websocket_clients",
        "Currently connected dashboard WebSocket clients.",
        len(state.ws_clients),
    )
    reg.gauge(
        "denon_dashboard_discovering",
        "1 while the backend is searching the network for a receiver.",
        state.discovering,
    )

    # -- process health: the 2026-08-05 runaway (50 MB -> 12.6 GB in 40 min)
    #    had no series that could have shown it coming. --
    reg.gauge(
        "denon_dashboard_process_resident_memory_bytes",
        "Resident set size of the backend process. Omitted where /proc is "
        "unavailable. Alert: DenonDashboardMemoryHigh.",
        _resident_memory_bytes(),
    )
    reg.gauge(
        "denon_dashboard_asyncio_tasks",
        "Live asyncio tasks in the event loop. Steady state is ~10-20 "
        "(background loops, readers, one per WebSocket client). "
        "Alert: DenonDashboardTaskLeak.",
        len(asyncio.all_tasks()),
    )
    reg.gauge(
        "denon_dashboard_radio_cache_entries",
        "Cached TuneIn browse results (bounded at 500).",
        radio_service.cache_entries(),
    )

    # -- telnet link (port 23): power, volume, source, surround --
    reg.gauge(
        "denon_telnet_connected",
        "1 if the telnet control connection to the receiver is established.",
        bool(link.get("connected", False)),
    )
    reg.gauge(
        "denon_telnet_supervised",
        "1 if the reconnect supervisor task is running. 0 means nothing will "
        "ever reconnect this link - always a bug, never a receiver in standby.",
        bool(link.get("supervised", False)),
    )
    reg.gauge(
        "denon_telnet_reconnect_attempts",
        "Consecutive failed connect attempts since the last success. "
        "Resets to 0 on connect, so it also reads as 'how long has it been down'.",
        int(link.get("reconnect_attempts", 0)),
    )
    reg.gauge(
        "denon_telnet_last_connected_timestamp_seconds",
        "Unix timestamp of the last successful telnet connect (0 = never).",
        float(link.get("last_connected_at") or 0.0),
    )
    reg.counter(
        "denon_telnet_connects_total",
        "Successful telnet (re)connects since process start. A steadily climbing "
        "value means the link is flapping, which `connected` alone cannot show.",
        int(link.get("connects_total", 0)),
    )

    # -- HEOS link (port 1255): transport, now-playing, radio --
    heos = state.heos
    reg.gauge(
        "denon_heos_connected",
        "1 if the HEOS CLI connection to the receiver is established.",
        bool(heos.connected) if heos is not None else False,
    )
    reg.gauge(
        "denon_heos_player_known",
        "1 if a HEOS player id has been discovered. Without it every transport "
        "command is a no-op even while the socket is up.",
        bool(heos is not None and heos.player_id is not None),
    )
    reg.gauge(
        "denon_heos_pending_commands",
        "HEOS commands written to the socket and still waiting for a reply "
        "(pruned on the 8 s timeout). Alert: DenonHeosCommandsStuck.",
        int(getattr(heos, "pending_count", 0) or 0) if heos is not None else 0,
    )
    reg.gauge(
        "denon_heos_lock_waiters",
        "HEOS commands blocked waiting for the command lock. The only series "
        "that can see a reentrant-lock deadlock: a blocked command never enters "
        "the pending list. Alert: DenonHeosCommandsStuck.",
        int(getattr(heos, "lock_waiters", 0) or 0) if heos is not None else 0,
    )
    reg.gauge(
        "denon_heos_callback_tasks",
        "HEOS event callback tasks currently running.",
        int(getattr(heos, "callback_task_count", 0) or 0) if heos is not None else 0,
    )

    # -- receiver state (omitted entirely while unknown, see _Registry.gauge) --
    power = receiver.get("power")
    reg.gauge(
        "denon_receiver_power",
        "1 if the receiver's main zone is powered on.",
        None if power is None else bool(power),
    )
    muted = receiver.get("muted")
    reg.gauge(
        "denon_receiver_muted", "1 if the main zone is muted.",
        None if muted is None else bool(muted),
    )
    reg.gauge(
        "denon_receiver_volume",
        "Main zone volume in the receiver's own scale (0-98, 80 = 0 dB).",
        receiver.get("volume"),
    )
    z2_power = receiver.get("z2_power")
    reg.gauge(
        "denon_receiver_zone2_power", "1 if zone 2 is powered on.",
        None if z2_power is None else bool(z2_power),
    )

    # Identity as a labelled constant. Deliberately does NOT carry source or
    # surround_mode: those change every time an input is switched and would leave
    # one stale series behind per value, forever.
    reg.info(
        "denon_dashboard_info",
        "Static target info. Value is always 1.",
        {
            "receiver_host": settings.denon_host or "auto",
            "device_name": settings.denon_device_name,
        },
    )
    return Response(content=reg.render(), media_type=CONTENT_TYPE)
