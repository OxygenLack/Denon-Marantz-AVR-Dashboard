"""Pydantic models for the API."""
from __future__ import annotations

from typing import Annotated, Any, Literal
from zoneinfo import ZoneInfo

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

from config import settings
from denon.const import (
    CHANNEL_NAMES,
    COMMAND_PATTERN,
    CV_0DB,
    CV_MAX,
    CV_MIN,
    SOURCE_CODE_PATTERN,
    SWL_0DB,
    SWL_MAX,
    SWL_MIN,
    TONE_0DB,
    TONE_MAX,
    TONE_MIN,
    VOLUME_0DB,
    VOLUME_MAX,
    VOLUME_MIN,
)
from night_mode_config import CHANNEL_VALUE_RANGE, HHMM_RE, DayKey

ThemeName = Literal["gold", "blue", "red", "green", "olive", "violet", "purple", "pink", "orange"]

# HEOS media id: one line, bounded (it ends up in a HEOS CLI URL).
RadioMid = Annotated[str, Field(min_length=1, max_length=500, pattern=r"^[^\r\n]+$",
                                description="Station media ID (e.g. 's280354')")]


def _known_channel(v: str) -> str:
    if v not in CHANNEL_NAMES:
        raise ValueError(f"Unknown channel: {v}")
    return v


# -- Request models --

class CommandRequest(BaseModel):
    command: str = Field(..., pattern=COMMAND_PATTERN,
                         description="Raw telnet command (e.g. 'PWON', 'MV50')")


class ConnectRequest(BaseModel):
    # `command` is the pre-2026-10 field name, still accepted.
    host: str = Field(..., min_length=1, max_length=64,
                      validation_alias=AliasChoices("host", "command"),
                      description="Receiver IP address (private LAN only)")


class VolumeRequest(BaseModel):
    level: float = Field(..., ge=VOLUME_MIN, le=VOLUME_MAX, multiple_of=0.5,
                         description=f"Volume level {VOLUME_MIN}–{VOLUME_MAX} in 0.5 steps "
                                     f"({VOLUME_0DB} = 0dB)")


class ChannelVolumeRequest(BaseModel):
    channel: str = Field(..., description="Channel code (FL, FR, C, SW, SL, SR, etc.)")
    level: int = Field(..., ge=CV_MIN, le=CV_MAX,
                       description=f"Level {CV_MIN}–{CV_MAX} ({CV_0DB} = 0dB)")

    check_channel = field_validator("channel")(_known_channel)


class ToneRequest(BaseModel):
    bass: int | None = Field(None, ge=TONE_MIN, le=TONE_MAX,
                             description=f"Bass {TONE_MIN}–{TONE_MAX} ({TONE_0DB} = 0dB)")
    treble: int | None = Field(None, ge=TONE_MIN, le=TONE_MAX,
                               description=f"Treble {TONE_MIN}–{TONE_MAX} ({TONE_0DB} = 0dB)")
    enabled: bool | None = Field(None, description="Tone control on/off")


class SubwooferLevelRequest(BaseModel):
    level: int = Field(..., ge=SWL_MIN, le=SWL_MAX,
                       description=f"Level {SWL_MIN}–{SWL_MAX} ({SWL_0DB} = 0dB)")
    index: int = Field(1, ge=1, le=2, description="Subwoofer 1 or 2")


class NightModeChannel(BaseModel):
    channel: str = Field(..., description="Channel code (FL, FR, C, SW, etc.)")
    mode: Literal["absolute", "offset"]
    value: int = Field(..., description="Absolute target (38–62) or offset in CV steps (±24)")

    check_channel = field_validator("channel")(_known_channel)

    @model_validator(mode="after")
    def _value_in_range(self) -> NightModeChannel:
        lo, hi = CHANNEL_VALUE_RANGE[self.mode]
        if not lo <= self.value <= hi:
            raise ValueError(f"{self.mode} value must be within {lo}..{hi}")
        return self


class NightModeRequest(BaseModel):
    enabled: bool
    channels: list[NightModeChannel] = []


class NightModeSchedule(BaseModel):
    enabled: bool = False
    days: list[DayKey] = []
    start: str = Field("22:00", pattern=HHMM_RE.pattern)
    end: str = Field("02:00", pattern=HHMM_RE.pattern)
    timezone: str = Field(default_factory=lambda: settings.timezone)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        try:
            ZoneInfo(v)
            return v
        except Exception as exc:
            raise ValueError(f"Invalid timezone: {v}") from exc


class NightModeConfigRequest(BaseModel):
    mode: Literal["absolute", "offset"] = "offset"
    schedule: NightModeSchedule = Field(default_factory=NightModeSchedule)
    channels: list[NightModeChannel] = []


class SourceRequest(BaseModel):
    source: str = Field(..., pattern=SOURCE_CODE_PATTERN,
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
    mid: RadioMid
    name: str = Field(..., min_length=1, max_length=120)
    image_url: str | None = Field(None, max_length=1000)
    station: str | None = Field(None, max_length=120)


class RadioPlayRequest(BaseModel):
    mid: RadioMid


class SurroundRequest(BaseModel):
    mode: str = Field(..., pattern=r"^[A-Z0-9 :.\-/+]{1,35}$",
                      description="Surround mode name (e.g. 'STEREO', 'MOVIE')")


class Zone2VolumeRequest(BaseModel):
    level: int = Field(..., ge=VOLUME_MIN, le=VOLUME_MAX,
                       description=f"Zone 2 volume {VOLUME_MIN}–{VOLUME_MAX}")


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
    heos_connected: bool = False
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
    timezone: str = Field(default_factory=lambda: settings.timezone)
    time_format: Literal["auto", "24h", "12h"] = "auto"


class UiSettingsRequest(BaseModel):
    theme: ThemeName | None = None


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


class SourceEntry(BaseModel):
    id: str
    name: str  # display name (persisted rename wins)
    default_name: str  # name without the persisted rename (env > receiver > built-in)


class SurroundCategory(BaseModel):
    code: str  # OPSMLALL category (MOV, MUS, GAM, PUR)
    label: str
    command: str  # MS<command> cycles through the category's modes


class DeviceInfoResponse(BaseModel):
    device_name: str = "Denon AVR"
    zone1_name: str = "Main Zone"
    zone2_name: str = "Zone 2"
    sources: list[SourceEntry] = []
    source_name_map: dict[str, str] = {}
    source_name_overrides: dict[str, str] = {}
    channel_volumes: dict[str, int] = {}
    channel_names: dict[str, str] = {}
    receiver_ip: str | None = None
    theme: str = "gold"
    ui_effects: UiEffectsResponse = UiEffectsResponse()
    time_settings: TimeSettingsResponse = TimeSettingsResponse()
    night_mode_config: NightModeConfigRequest = Field(default_factory=NightModeConfigRequest)
    radio_favorites: list[RadioFavoriteResponse] = []
    # Inputs the HEOS transport controls drive (NET, BT, MPLAY, ...)
    media_sources: list[str] = []
    surround_categories: list[SurroundCategory] = []
    # Fallback list for receivers that do not send OPSMLALL
    surround_modes: list[str] = []


class RadioStatusResponse(BaseModel):
    ready: bool
    reason: Literal["ok", "no_heos", "signed_out", "tunein_unavailable"]
    heos_connected: bool
    account_signed_in: bool
    username: str | None = None
    tunein_available: bool
    cached_stations: int = 0
    preloading: bool = False


class HealthResponse(BaseModel):
    status: str
    telnet_connected: bool
    receiver_ip: str
    receiver_power: bool | None = None
    device_name: str | None = None
    discovery_mode: bool = False
    discovering: bool = False
