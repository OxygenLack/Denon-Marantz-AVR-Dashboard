"""Pydantic models for the API."""
from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


# -- Request models --

class CommandRequest(BaseModel):
    command: str = Field(..., pattern=r"^[A-Z0-9 :?.+/\-]{1,50}$",
                         description="Raw telnet command (e.g. 'PWON', 'MV50')")


class VolumeRequest(BaseModel):
    level: float = Field(..., ge=0, le=98, description="Volume level 0–98 (80 = 0dB)")


class ChannelVolumeRequest(BaseModel):
    channel: str = Field(..., pattern=r"^[A-Z0-9]{1,4}$",
                         description="Channel code (FL, FR, C, SW, SL, SR, etc.)")
    level: int = Field(..., ge=38, le=62, description="Level 38–62 (50 = 0dB)")


class ToneRequest(BaseModel):
    bass: int | None = Field(None, ge=44, le=56, description="Bass 44–56 (50 = 0dB)")
    treble: int | None = Field(None, ge=44, le=56, description="Treble 44–56 (50 = 0dB)")
    enabled: bool | None = Field(None, description="Tone control on/off")


class SubwooferLevelRequest(BaseModel):
    level: int = Field(..., ge=38, le=62, description="Level 38–62 (50 = 0dB)")
    index: int = Field(1, ge=1, le=2, description="Subwoofer 1 or 2")


class SourceRequest(BaseModel):
    source: str = Field(..., pattern=r"^[A-Z0-9/]{1,10}$",
                        description="Source command code (e.g. 'GAME', 'BD', 'TV')")


class SurroundRequest(BaseModel):
    mode: str = Field(..., pattern=r"^[A-Z0-9 :.\-/+]{1,35}$",
                      description="Surround mode name (e.g. 'STEREO', 'MOVIE')")


class Zone2VolumeRequest(BaseModel):
    level: int = Field(..., ge=0, le=98, description="Zone 2 volume 0–98")


class DynamicEQRequest(BaseModel):
    enabled: bool


class DynamicVolumeRequest(BaseModel):
    mode: Literal["OFF", "LIT", "MED", "HEV"]


class MultEQRequest(BaseModel):
    mode: Literal["AUDYSSEY", "BYP.LR", "FLAT", "MANUAL", "OFF"]


class SleepTimerRequest(BaseModel):
    minutes: int | None = Field(None, ge=0, le=120, description="0 or None = OFF, 1–120 = minutes")


class EcoModeRequest(BaseModel):
    mode: Literal["ON", "AUTO", "OFF"]


# -- Response models --

class StatusResponse(BaseModel):
    connected: bool
    discovering: bool = False
    power: bool | None = None
    volume: float | None = None
    volume_max: float | None = None
    muted: bool | None = None
    source: str | None = None
    source_name: str | None = None
    heos_source: str | None = None
    surround_mode: str | None = None
    surround_mode_list: list[dict] = []
    sound_decoder: str | None = None
    channel_volumes: dict[str, int] = {}
    tone_control: bool | None = None
    bass: int | None = None
    treble: int | None = None
    subwoofer_level: int | None = None
    subwoofer2_level: int | None = None
    dialog_level: int | None = None
    dialog_level_enabled: bool | None = None
    multeq: str | None = None
    dynamic_eq: bool | None = None
    dynamic_volume: str | None = None
    ref_level_offset: int | None = None
    sleep_timer: int | None = None
    eco_mode: str | None = None
    z2_power: bool | None = None
    z2_volume: int | None = None
    z2_muted: bool | None = None
    z2_source: str | None = None
    z2_source_name: str | None = None
    speaker_calibration: dict[str, float] = {}
    now_playing: dict[str, Any] | None = None
    play_state: str | None = None
    stream_quality: str | None = None


class DeviceInfoResponse(BaseModel):
    device_name: str = "Denon AVR"
    zone1_name: str = "Main Zone"
    zone2_name: str = "Zone 2"
    sources: list[dict[str, str]] = []
    source_name_map: dict[str, str] = {}
    channel_volumes: dict[str, int] = {}
    channel_names: dict[str, str] = {}
    receiver_ip: str | None = None
    theme: str = "gold"


_VALID_THEME_NAMES = {'gold', 'blue', 'red', 'green', 'olive', 'violet', 'purple', 'pink', 'orange'}
_VALID_OVERRIDE_KEYS = {'--accent', '--accent-dim', '--bg', '--card', '--surface', '--border', '--text', '--muted'}
_HEX_RE = re.compile(r'^#[0-9a-fA-F]{3,8}$')


class ThemeConfig(BaseModel):
    base: str = "gold"
    overrides: dict[str, str] = {}

    @field_validator('base')
    @classmethod
    def base_must_be_valid(cls, v: str) -> str:
        if v not in _VALID_THEME_NAMES:
            raise ValueError(f"base must be one of {sorted(_VALID_THEME_NAMES)}")
        return v

    @field_validator('overrides')
    @classmethod
    def overrides_must_be_valid(cls, v: dict[str, str]) -> dict[str, str]:
        for key, val in v.items():
            if key not in _VALID_OVERRIDE_KEYS:
                raise ValueError(f"override key '{key}' not allowed; valid keys: {sorted(_VALID_OVERRIDE_KEYS)}")
            if not _HEX_RE.match(val):
                raise ValueError(f"override value '{val}' must be a hex color (e.g. #RRGGBB)")
        return v


class PreferencesResponse(BaseModel):
    theme: ThemeConfig


class HealthResponse(BaseModel):
    status: str
    telnet_connected: bool
    receiver_ip: str
    receiver_power: bool | None = None
    device_name: str | None = None
    discovery_mode: bool = False
    discovering: bool = False
