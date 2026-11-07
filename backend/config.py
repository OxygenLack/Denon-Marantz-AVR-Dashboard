"""Application configuration via environment variables."""
from __future__ import annotations

import json
import logging
from typing import Annotated, Any, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode

from denon.const import DEFAULT_HEOS_PORT, DEFAULT_TELNET_PORT

_LOGGER = logging.getLogger(__name__)

TimeFormat = Literal["auto", "24h", "12h"]


class Settings(BaseSettings):
    # Dashboard port. Not read by the app itself: the Dockerfile CMD passes
    # $DENON_DASHBOARD_PORT to uvicorn. Kept so the variable is documented.
    port: int = 8080

    # Receiver IP — leave empty to enable auto-discovery via SSDP
    denon_host: str = ""
    denon_telnet_port: int = DEFAULT_TELNET_PORT
    denon_heos_port: int = DEFAULT_HEOS_PORT

    # Optional display names (auto-detected via telnet if not set)
    denon_device_name: str = "Denon AVR"
    denon_zone1_name: str = "Main Zone"
    denon_zone2_name: str = "Zone 2"

    # Custom source names as a JSON object: {"GAME":"Game Console","BD":"Blu-ray"}.
    # Empty, broken or non-object values are ignored with a warning (never a
    # startup failure). NoDecode: the validator below parses the raw string.
    denon_source_names: Annotated[dict[str, str], NoDecode] = {}

    # Include HEOS/network sources (NET, BT, IRADIO, ...) automatically.
    # Set to false if you only want physical inputs.
    heos_sources: bool = True

    # UI theme: gold (default), blue, red, green, olive, violet, purple, pink, orange
    theme: str = "gold"

    # Local timezone and time display format for schedules
    timezone: str = "Europe/Berlin"
    time_format: TimeFormat = "auto"  # unknown values fall back to auto

    # Optional UI experience effects
    ui_ambient_background: bool = True
    ui_seasonal_effects: str = "auto"  # auto, off, winter, christmas, halloween
    ui_shortcut_overlay: bool = True
    ui_card_animations: bool = True
    ui_ambient_intensity: float = 1.0

    # CORS allowed origins (comma-separated). Empty = no CORS headers (same-origin only).
    cors_origins: str = ""

    # Origins allowed to embed the dashboard in an <iframe> (comma-separated,
    # scheme://host[:port]). Empty = framing denied (CSP frame-ancestors 'none').
    frame_ancestors: str = ""

    log_level: str = "INFO"

    # Demo mode: simulate a receiver without a real connection (no AVR needed)
    demo_mode: bool = False

    # Persistent JSON files (source names, UI settings, night mode, favorites)
    data_dir: str = "/data"
    # Built frontend served at / (skipped when the directory does not exist)
    static_dir: str = "/app/static"

    @field_validator("denon_source_names", mode="before")
    @classmethod
    def _parse_source_names(cls, value: Any) -> dict[str, str]:
        if isinstance(value, str):
            if not value.strip():
                return {}
            try:
                value = json.loads(value)
            except json.JSONDecodeError as exc:
                _LOGGER.warning("DENON_SOURCE_NAMES is not valid JSON, ignored: %s", exc)
                return {}
        if not isinstance(value, dict):
            _LOGGER.warning(
                "DENON_SOURCE_NAMES must be a JSON object, got %s; ignored", type(value).__name__
            )
            return {}
        return {str(k): str(v) for k, v in value.items() if isinstance(v, str) and v.strip()}

    @field_validator("time_format", mode="before")
    @classmethod
    def _parse_time_format(cls, value: Any) -> str:
        text = str(value or "").strip().lower()
        if text in ("auto", "24h", "12h"):
            return text
        _LOGGER.warning("TIME_FORMAT %r unknown, using auto", value)
        return "auto"

    model_config = {"env_prefix": "DENON_DASHBOARD_", "env_file": ".env"}


settings = Settings()
