"""Night Mode preset: default shape and normalisation of persisted data."""
from __future__ import annotations

import re
from typing import Any, Literal, get_args
from zoneinfo import ZoneInfo

from config import settings
from denon.const import CHANNEL_NAMES, CV_MAX, CV_MIN

DayKey = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# Index matches datetime.weekday() (Monday = 0).
DAY_KEYS: tuple[DayKey, ...] = get_args(DayKey)
VALID_DAYS = frozenset(DAY_KEYS)
HHMM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

DEFAULT_START = "22:00"
DEFAULT_END = "02:00"

# Allowed channel values per mode: an absolute CV target, or an offset that
# can span the whole CV range in either direction.
CHANNEL_VALUE_RANGE: dict[str, tuple[int, int]] = {
    "absolute": (CV_MIN, CV_MAX),
    "offset": (-(CV_MAX - CV_MIN), CV_MAX - CV_MIN),
}


def default_night_mode_config() -> dict[str, Any]:
    return {
        "mode": "offset",
        "schedule": {
            "enabled": False,
            "days": [],
            "start": DEFAULT_START,
            "end": DEFAULT_END,
            "timezone": settings.timezone,
        },
        "channels": [],
    }


def _valid_timezone(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        ZoneInfo(value)
    except Exception:
        return False
    return True


def _hhmm(value: Any, default: str) -> str:
    return value if isinstance(value, str) and HHMM_RE.match(value) else default


def _normalize_channels(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    channels: list[dict[str, Any]] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        channel = entry.get("channel")
        mode = entry.get("mode")
        value = entry.get("value")
        if channel not in CHANNEL_NAMES or mode not in CHANNEL_VALUE_RANGE:
            continue
        if isinstance(value, bool) or not isinstance(value, int):
            continue
        lo, hi = CHANNEL_VALUE_RANGE[mode]
        if not lo <= value <= hi:
            continue
        channels.append({"channel": channel, "mode": mode, "value": value})
    return channels


def normalize_night_mode_config(data: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce any persisted/posted dict into the canonical shape; never raises.

    Invalid pieces fall back to the defaults or are dropped, so the result
    always validates as ``NightModeConfigRequest``.
    """
    base = default_night_mode_config()
    if not isinstance(data, dict):
        return base
    mode = data.get("mode", "offset")
    if mode not in ("absolute", "offset"):
        mode = "offset"
    schedule = data.get("schedule", {}) if isinstance(data.get("schedule"), dict) else {}
    days = (
        [d for d in schedule.get("days", []) if d in VALID_DAYS]
        if isinstance(schedule.get("days"), list) else []
    )
    timezone = schedule.get("timezone")
    return {
        "mode": mode,
        "schedule": {
            "enabled": bool(schedule.get("enabled", False)),
            "days": days,
            "start": _hhmm(schedule.get("start"), DEFAULT_START),
            "end": _hhmm(schedule.get("end"), DEFAULT_END),
            "timezone": timezone if _valid_timezone(timezone) else settings.timezone,
        },
        "channels": _normalize_channels(data.get("channels", [])),
    }
