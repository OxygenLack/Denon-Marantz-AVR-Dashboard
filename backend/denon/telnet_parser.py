"""Telnet response-line parser for Denon/Marantz receivers.

`TelnetParserMixin` holds the handler table and every `_handle_*` method.
`DenonTelnetClient` inherits it; the transport, supervisor and broadcaster
stay in telnet_client.py. The handlers mutate `self.state` and return True
when the state changed (the caller then calls `self._mark_dirty()`).
"""
from __future__ import annotations

import logging
import re
from typing import Any

from .const import CHANNEL_NAMES, KNOWN_MODE_COMMANDS, SURROUND_CATEGORIES

_LOGGER = logging.getLogger(__name__)

# A real receiver lists ~25 surround modes; anything beyond this is a stream
# that never terminates with END.
OPSMLALL_MAX_ENTRIES = 256


class TelnetParserMixin:
    """Line parser. The host class provides `state`, `_opsmlall_buffer`,
    `_opsmlall_overflow_logged` and `_mark_dirty()`."""

    state: dict[str, Any]
    _opsmlall_buffer: list[dict]
    _opsmlall_overflow_logged: bool

    def _mark_dirty(self) -> None:  # pragma: no cover - provided by the host class
        raise NotImplementedError


    def _init_handlers(self) -> None:
        if hasattr(self, "_handlers"):
            return
        self._handlers = [
            (re.compile(r"^PW(STANDBY|ON)$"), self._handle_power),
            (re.compile(r"^ZM(ON|OFF)$"), self._handle_zone_main),
            (re.compile(r"^MV(MAX\s*\d{2,3}|\d{2,3})$"), self._handle_volume),
            (re.compile(r"^MU(ON|OFF)$"), self._handle_mute),
            (re.compile(r"^SI(.+)$"), self._handle_source),
            (re.compile(r"^MS(.+)$"), self._handle_surround_mode),
            (re.compile(r"^CV([A-Z0-9]+)\s+(\d+)$"), self._handle_channel_volume),
            (re.compile(r"^PSTONE CTRL(.+)$"), self._handle_tone_ctrl),
            (re.compile(r"^PSBAS(.+)$"), self._handle_bass),
            (re.compile(r"^PSTRE(.+)$"), self._handle_treble),
            (re.compile(r"^PSDIL(.+)$"), self._handle_dialog),
            (re.compile(r"^PSSWL2(.+)$"), self._handle_subwoofer2),
            (re.compile(r"^PSSWL(.+)$"), self._handle_subwoofer),
            (re.compile(r"^PSMULTEQ:(.+)$"), self._handle_multeq),
            (re.compile(r"^PSDYNEQ(.+)$"), self._handle_dyneq),
            (re.compile(r"^PSDYNVOL(.+)$"), self._handle_dynvol),
            (re.compile(r"^PSREFLEV(.+)$"), self._handle_reflev),
            (re.compile(r"^SLP(.+)$"), self._handle_sleep),
            (re.compile(r"^ECO(.+)$"), self._handle_eco),
            (re.compile(r"^NSFRN\s*(.+)$"), self._handle_nsfrn),
            (re.compile(r"^SSFUN(.+)$"), self._handle_ssfun),
            (re.compile(r"^SSSOD(.+)$"), self._handle_sssod),
            (re.compile(r"^SD(.+)$"), self._handle_sd),
            (re.compile(r"^OPSMLALL(.*)$"), self._handle_opsmlall),
            # Z2 payloads: power/mute, sleep (SLP<value>), volume (2-3 digits),
            # or a source code (uppercase + digits + '/', 2-12 chars). The
            # source class is intentionally tight so unknown Z2... lines do
            # not silently get stored as z2_source.
            (
                re.compile(
                    r"^Z2(ON|OFF|MUON|MUOFF|SLP[A-Z0-9]+|\d{2,3}|[A-Z][A-Z0-9/]{1,11})$"
                ),
                self._handle_zone2,
            ),
        ]

    async def _parse(self, line: str) -> None:
        self._init_handlers()
        for pattern, handler in self._handlers:
            match = pattern.match(line)
            if match:
                if handler(match):
                    self._mark_dirty()
                return

    def _set_int(self, key: str, raw: str, *, skip: tuple[str, ...] = ("?", "")) -> bool:
        """Store ``raw`` as an int under ``key``; False for skip values or junk."""
        val = raw.strip()
        if val in skip:
            return False
        try:
            self.state[key] = int(val)
        except ValueError:
            return False
        return True

    def _handle_power(self, match: re.Match) -> bool:
        if match.group(1) == "STANDBY":
            self.state["power"] = False
            return True
        return False

    def _handle_zone_main(self, match: re.Match) -> bool:
        self.state["power"] = (match.group(1) == "ON")
        return True

    def _handle_volume(self, match: re.Match) -> bool:
        val = match.group(1)
        if val.startswith("MAX"):
            v = self._parse_volume(val[3:])
            if v is None:
                return False
            self.state["volume_max"] = v
            return True
        v = self._parse_volume(val)
        if v is None:
            return False
        self.state["volume"] = v
        return True

    def _handle_mute(self, match: re.Match) -> bool:
        self.state["muted"] = (match.group(1) == "ON")
        return True

    def _handle_source(self, match: re.Match) -> bool:
        self.state["source"] = match.group(1)
        return True

    def _handle_surround_mode(self, match: re.Match) -> bool:
        self.state["surround_mode"] = match.group(1)
        return True

    def _handle_channel_volume(self, match: re.Match) -> bool:
        ch, val = match.group(1), int(match.group(2))
        if ch in CHANNEL_NAMES:
            self.state["channel_volumes"][ch] = val
            return True
        return False

    def _handle_tone_ctrl(self, match: re.Match) -> bool:
        self.state["tone_control"] = (match.group(1).strip() == "ON")
        return True

    def _handle_bass(self, match: re.Match) -> bool:
        return self._set_int("bass", match.group(1))

    def _handle_treble(self, match: re.Match) -> bool:
        return self._set_int("treble", match.group(1))

    def _handle_dialog(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "ON":
            self.state["dialog_level_enabled"] = True
            return True
        elif val == "OFF":
            self.state["dialog_level_enabled"] = False
            return True
        elif val not in ("?", ""):
            try:
                self.state["dialog_level"] = int(val)
                return True
            except ValueError:
                pass
        return False

    def _handle_subwoofer2(self, match: re.Match) -> bool:
        return self._set_int("subwoofer2_level", match.group(1), skip=("ON", "OFF", "?", ""))

    def _handle_subwoofer(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "OFF":
            self.state["subwoofer_level"] = None
            return True
        elif val not in ("ON", "?", ""):
            try:
                self.state["subwoofer_level"] = int(val)
                return True
            except ValueError:
                pass
        return False

    def _handle_multeq(self, match: re.Match) -> bool:
        self.state["multeq"] = match.group(1).strip()
        return True

    def _handle_dyneq(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val in ("ON", "OFF"):
            self.state["dynamic_eq"] = (val == "ON")
            return True
        return False

    def _handle_dynvol(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val != "?":
            self.state["dynamic_volume"] = val
            return True
        return False

    def _handle_reflev(self, match: re.Match) -> bool:
        return self._set_int("ref_level_offset", match.group(1))

    def _handle_sleep(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val == "OFF":
            self.state["sleep_timer"] = None
            return True
        else:
            try:
                self.state["sleep_timer"] = int(val)
                return True
            except ValueError:
                pass
        return False

    def _handle_eco(self, match: re.Match) -> bool:
        val = match.group(1).strip()
        if val != "?" and val:
            self.state["eco_mode"] = val
            return True
        return False

    def _handle_nsfrn(self, match: re.Match) -> bool:
        name = match.group(1).strip()
        if name and name != "?":
            self.state["friendly_name"] = name
            return True
        return False

    def _handle_ssfun(self, match: re.Match) -> bool:
        payload = match.group(1)
        if payload.strip() == "END":
            return False
        if " " in payload:
            code, name = payload.split(" ", 1)
            name = name.strip()
            if code and name:
                self.state["source_names"][code] = name
                return True
        return False

    def _handle_sssod(self, match: re.Match) -> bool:
        payload = match.group(1)
        if payload.strip() == "END":
            return False
        if " " in payload:
            code, status = payload.rsplit(" ", 1)
            code = code.strip()
            if code and status == "DEL":
                self.state["hidden_sources"].add(code)
                return True
            elif code and status == "USE":
                self.state["hidden_sources"].discard(code)
                return True
        return False

    def _handle_sd(self, match: re.Match) -> bool:
        val = match.group(1)
        if val and val != "?":
            self.state["sound_decoder"] = val
            return True
        return False

    def _handle_opsmlall(self, match: re.Match) -> bool:
        payload = match.group(1).lstrip()
        if payload == "END":
            self.state["surround_mode_list"] = self._opsmlall_buffer
            self._opsmlall_buffer = []
            self._opsmlall_overflow_logged = False
            return True
        elif len(self._opsmlall_buffer) >= OPSMLALL_MAX_ENTRIES:
            if not self._opsmlall_overflow_logged:
                _LOGGER.warning(
                    "OPSMLALL buffer exceeded %d entries without END, dropped",
                    OPSMLALL_MAX_ENTRIES,
                )
                self._opsmlall_overflow_logged = True
        elif len(payload) >= 7:
            cat = payload[:3]
            sort_id = payload[3:5]
            active = (payload[5] == "1")
            display_name = payload[6:]
            telnet_cmd = KNOWN_MODE_COMMANDS.get(display_name)
            self._opsmlall_buffer.append({
                "category": cat,
                "category_label": SURROUND_CATEGORIES.get(cat, cat),
                "id": sort_id,
                "active": active,
                "display_name": display_name,
                "command": telnet_cmd,
            })
        return False

    def _handle_zone2(self, match: re.Match) -> bool:
        val = match.group(1)
        if val == "ON":
            self.state["z2_power"] = True
            return True
        elif val == "OFF":
            self.state["z2_power"] = False
            return True
        elif val == "MUON":
            self.state["z2_muted"] = True
            return True
        elif val == "MUOFF":
            self.state["z2_muted"] = False
            return True
        elif val.startswith("SLP"):
            v = val[3:].strip()
            if v == "OFF":
                self.state["z2_sleep_timer"] = None
                return True
            else:
                try:
                    self.state["z2_sleep_timer"] = int(v)
                    return True
                except ValueError:
                    pass
        elif val.isdigit():
            self.state["z2_volume"] = int(val)
            return True
        elif val:
            self.state["z2_source"] = val
            return True
        return False

    def _parse_volume(self, s: str) -> float | None:
        s = s.strip()
        if not s:
            return None
        try:
            if len(s) == 3 and s[2] == "5":
                return int(s[:2]) + 0.5
            return float(int(s))
        except ValueError:
            return None
