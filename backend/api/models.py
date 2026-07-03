"""Pydantic models for the API."""
from __future__ import annotations

from typing import Any, Literal
from zoneinfo import ZoneInfo

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


class NightModeChannel(BaseModel):
    channel: str = Field(..., pattern=r"^[A-Z0-9]{1,4}$",
                         description="Channel code (FL, FR, C, SW, etc.)")
    mode: Literal["absolute", "offset"]
    value: int = Field(..., description="Absolute target (38–62) or offset in CV steps")


class NightModeRequest(BaseModel):
    enabled: bool
    channels: list[NightModeChannel] = []


class NightModeSchedule(BaseModel):
    enabled: bool = False
    days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = []
    start: str = Field("22:00", pattern=r"^\d{2}:\d{2}$")
    end: str = Field("02:00", pattern=r"^\d{2}:\d{2}$")
    timezone: str = "Europe/Berlin"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
            return v
        except Exception:
            raise ValueError(f"Invalid timezone: {v}")


class NightModeConfigRequest(BaseModel):
    mode: Literal["absolute", "offset"] = "offset"
    schedule: NightModeSchedule = NightModeSchedule()
    channels: list[NightModeChannel] = []


class SourceRequest(BaseModel):
    source: str = Field(..., pattern=r"^[A-Z0-9/]{1,10}$",
                        description="Source command code (e.g. 'GAME', 'BD', 'TV')")


class SourceNameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50,
                      description="Custom display name for an input source")

    @field_validator("name")
    @classmethod
    def _strip_control_chars(cls, v: str) -> str:
        cleaned = "".join(c for c in v if c == "\t" or (ord(c) >= 0x20 and c != "\x7f"))
        cleaned = cleaned.strip()
        if not cleaned:
            raise ValueError("name must contain printable characters")
        return cleaned


class RadioFavoriteRequest(BaseModel):
    mid: str = Field(..., min_length=1, max_length=500, pattern=r"^[^\r\n]+$")
    name: str = Field(..., min_length=1, max_length=120)
    image_url: str | None = Field(None, max_length=1000)
    station: str | None = Field(None, max_length=120)


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
    theme: str | None = None
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
    night_mode_enabled: bool = False
    night_mode_snapshot: dict[str, int] = {}
    eco_mode: str | None = None
    z2_power: bool | None = None
    z2_volume: int | None = None
    z2_muted: bool | None = None
    z2_sleep_timer: int | None = None
    z2_source: str | None = None
    z2_source_name: str | None = None
    speaker_calibration: dict[str, float] = {}
    now_playing: dict[str, Any] | None = None
    play_state: str | None = None
    stream_quality: str | None = None


class TimeSettingsResponse(BaseModel):
    timezone: str = "Europe/Berlin"
    time_format: Literal["auto", "24h", "12h"] = "auto"


class UiSettingsResponse(BaseModel):
    theme: str | None = None


class UiSettingsRequest(BaseModel):
    theme: str | None = None


class UiEffectsResponse(BaseModel):
    ambient_background: bool = True
    seasonal_effects: str = "auto"
    shortcut_overlay: bool = True
    card_animations: bool = True
    ambient_intensity: float = 1.0


class RadioFavoriteResponse(BaseModel):
    mid: str
    name: str
    image_url: str | None = None
    station: str | None = None


class DeviceInfoResponse(BaseModel):
    device_name: str = "Denon AVR"
    zone1_name: str = "Main Zone"
    zone2_name: str = "Zone 2"
    sources: list[dict[str, str]] = []
    source_name_map: dict[str, str] = {}
    source_name_overrides: dict[str, str] = {}
    channel_volumes: dict[str, int] = {}
    channel_names: dict[str, str] = {}
    receiver_ip: str | None = None
    theme: str = "gold"
    ui_effects: UiEffectsResponse = UiEffectsResponse()
    time_settings: TimeSettingsResponse = TimeSettingsResponse()
    night_mode_config: dict[str, Any] = {"channels": []}
    radio_favorites: list[RadioFavoriteResponse] = []


class HealthResponse(BaseModel):
    status: str
    telnet_connected: bool
    receiver_ip: str
    receiver_power: bool | None = None
    device_name: str | None = None
    discovery_mode: bool = False
    discovering: bool = False
