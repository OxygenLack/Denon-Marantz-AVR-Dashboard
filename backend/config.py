"""Application configuration via environment variables."""
from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings

from denon.const import DEFAULT_HEOS_PORT, DEFAULT_TELNET_PORT


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
    # Parsed by pydantic-settings; anything but an object fails at startup.
    denon_source_names: dict[str, str] = {}

    # Include HEOS/network sources (NET, BT, IRADIO, ...) automatically.
    # Set to false if you only want physical inputs.
    heos_sources: bool = True

    # UI theme: gold (default), blue, red, green, olive, violet, purple, pink, orange
    theme: str = "gold"

    # Local timezone and time display format for schedules
    timezone: str = "Europe/Berlin"
    time_format: Literal["auto", "24h", "12h"] = "auto"

    # Optional UI experience effects
    ui_ambient_background: bool = True
    ui_seasonal_effects: str = "auto"  # auto, off, winter, christmas, halloween
    ui_shortcut_overlay: bool = True
    ui_card_animations: bool = True
    ui_ambient_intensity: float = 1.0

    # CORS allowed origins (comma-separated). Empty = no CORS headers (same-origin only).
    cors_origins: str = ""

    log_level: str = "INFO"

    # Demo mode: simulate a receiver without a real connection (no AVR needed)
    demo_mode: bool = False

    # Persistent JSON files (source names, UI settings, night mode, favorites)
    data_dir: str = "/data"
    # Built frontend served at / (skipped when the directory does not exist)
    static_dir: str = "/app/static"

    model_config = {"env_prefix": "DENON_DASHBOARD_", "env_file": ".env"}


settings = Settings()
