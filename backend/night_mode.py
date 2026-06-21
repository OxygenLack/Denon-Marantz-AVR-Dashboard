"""Night Mode application and scheduler helpers."""
from __future__ import annotations

import logging
from datetime import datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from denon.const import CV_MAX, CV_MIN
from state import AppState, app_state

_LOGGER = logging.getLogger(__name__)

DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(":", 1)
    return time(int(hour), int(minute))


def is_schedule_active(config: dict[str, Any], now: datetime | None = None) -> bool:
    schedule = config.get("schedule", {})
    if not schedule.get("enabled"):
        return False
    days = schedule.get("days") or []
    if not days:
        return False

    tz = ZoneInfo(schedule.get("timezone") or "Europe/Berlin")
    now = now.astimezone(tz) if now else datetime.now(tz)
    start = _parse_hhmm(schedule.get("start") or "22:00")
    end = _parse_hhmm(schedule.get("end") or "02:00")
    current = now.time().replace(second=0, microsecond=0)

    if start <= end:
        return DAY_KEYS[now.weekday()] in days and start <= current < end

    # Cross-midnight window. After midnight belongs to the previous selected day.
    if current >= start:
        return DAY_KEYS[now.weekday()] in days
    if current < end:
        previous_day = DAY_KEYS[(now.weekday() - 1) % 7]
        return previous_day in days
    return False


async def apply_night_mode(state: AppState, enabled: bool, channels: list[dict[str, Any]], auto: bool = False) -> dict[str, Any]:
    if not state.telnet or not state.telnet.connected:
        raise HTTPException(503, "Not connected")

    async with state.locked():
        channel_volumes = dict(state.telnet.state.get("channel_volumes", {}))

        if enabled:
            if not state.night_mode_enabled:
                state.night_mode_snapshot = channel_volumes.copy()
            base_volumes = state.night_mode_snapshot or channel_volumes

            for channel in channels:
                ch = channel["channel"]
                if ch not in channel_volumes:
                    _LOGGER.warning("Night mode channel not available, skipping: %s", ch)
                    continue

                mode = channel.get("mode", "offset")
                value = int(channel.get("value", 0))
                target = value if mode == "absolute" else base_volumes.get(ch, channel_volumes[ch]) + value
                clamped = max(CV_MIN, min(CV_MAX, target))
                if clamped != target:
                    _LOGGER.warning("Night mode target for %s out of range (%s), clamped to %s", ch, target, clamped)

                ok = await state.telnet.send(f"CV{ch} {clamped:02d}")
                if not ok:
                    raise HTTPException(502, f"Failed to send channel command for {ch}")

            state.night_mode_enabled = True
            state.night_mode_auto_active = auto
        else:
            for ch, level in list(state.night_mode_snapshot.items()):
                if ch not in channel_volumes:
                    _LOGGER.warning("Night mode restore channel not available, skipping: %s", ch)
                    continue
                ok = await state.telnet.send(f"CV{ch} {int(level):02d}")
                if not ok:
                    raise HTTPException(502, f"Failed to restore channel {ch}")

            state.night_mode_snapshot = {}
            state.night_mode_enabled = False
            state.night_mode_auto_active = False

    await state.broadcast_state()
    return {"ok": True, "night_mode_enabled": state.night_mode_enabled}


async def reconcile_night_mode_schedule() -> None:
    from state import app_state
    config = app_state.night_mode_config
    active = is_schedule_active(config)
    channels = config.get("channels") or []
    if active and channels and not app_state.night_mode_enabled:
        await apply_night_mode(app_state, True, channels, auto=True)
    elif not active and app_state.night_mode_enabled and app_state.night_mode_auto_active:
        await apply_night_mode(app_state, False, [], auto=True)
