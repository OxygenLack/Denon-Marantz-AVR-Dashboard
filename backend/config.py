"""Application configuration via environment variables."""
from __future__ import annotations

import json

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Dashboard port
    port: int = 8080

    # Receiver IP — leave empty to enable auto-discovery via SSDP
    denon_host: str = ""
    denon_telnet_port: int = 23
    denon_heos_port: int = 1255

    # Optional display names (auto-detected via telnet if not set)
    denon_device_name: str = "Denon AVR"
    denon_zone1_name: str = "Main Zone"
    denon_zone2_name: str = "Zone 2"

    # Custom source names as JSON: {"GAME":"Game Console","BD":"Blu-ray"}
    denon_source_names: str = "{}"

    # Include HEOS/network sources (NET, BT, IRADIO, ...) automatically.
    # Set to false if you only want physical inputs.
    heos_sources: bool = True

    # UI theme: gold (default), blue, red, green, olive, violet, purple, pink, orange
    theme: str = "gold"

    # Local timezone and time display format for schedules
    timezone: str = "Europe/Berlin"
    time_format: str = "auto"  # auto, 24h, 12h

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

    @property
    def source_name_map(self) -> dict[str, str]:
        try:
            return json.loads(self.denon_source_names)
        except (json.JSONDecodeError, TypeError):
            return {}

    model_config = {"env_prefix": "DENON_DASHBOARD_", "env_file": ".env"}


settings = Settings()
