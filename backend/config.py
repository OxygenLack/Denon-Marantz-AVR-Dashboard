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

    # Android TV Remote protocol v2
    android_tv_host: str = ""
    android_tv_client_name: str = "Denon Dashboard"
    android_tv_storage_dir: str = "/data/androidtv"

    # Optional Android Debug Bridge integration for screenshots/app launching.
    android_tv_adb_enabled: bool = False
    android_tv_adb_path: str = "adb"
    android_tv_adb_port: int = 5555
    android_tv_adb_storage_dir: str = "/data/adb"

    # CORS allowed origins (comma-separated). Empty = no CORS headers (same-origin only).
    cors_origins: str = ""

    log_level: str = "INFO"

    # Demo mode: simulate a receiver without a real connection
    demo_mode: bool = False

    @property
    def source_name_map(self) -> dict[str, str]:
        try:
            return json.loads(self.denon_source_names)
        except (json.JSONDecodeError, TypeError):
            return {}

    model_config = {"env_prefix": "DENON_DASHBOARD_", "env_file": ".env"}


settings = Settings()
