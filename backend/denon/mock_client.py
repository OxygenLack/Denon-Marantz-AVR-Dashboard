"""Mock Denon telnet client for development without a physical receiver."""
from __future__ import annotations

from denon.telnet_client import DenonTelnetClient


class MockDenonClient(DenonTelnetClient):
    """Simulates a Denon AVR. No network connection required.

    Enabled via DENON_DASHBOARD_DEMO_MODE=true. Commands sent via send()
    are translated into synthetic receiver responses and fed through the
    normal _parse() path so all state updates work identically to production.
    """

    def __init__(self) -> None:
        super().__init__("mock", 0)
        self._connected = True
        self.state.update({
            "power": True,
            "volume": 45.0,
            "volume_max": 98.0,
            "muted": False,
            "source": "GAME",
            "surround_mode": "DOLBY DIGITAL",
            "channel_volumes": {
                "FL": 50, "FR": 50, "C": 50,
                "SL": 50, "SR": 50, "SW": 50,
            },
            "source_names": {
                "GAME": "Game Console",
                "TV": "TV Audio",
                "NET": "Online Music",
                "BD": "Blu-ray",
                "MPLAY": "Media Player",
                "BT": "Bluetooth",
                "IRADIO": "Internet Radio",
            },
            "friendly_name": "Demo AVR",
            "tone_control": True,
            "bass": 50,
            "treble": 50,
            "subwoofer_level": 50,
            "multeq": "AUDYSSEY",
            "dynamic_eq": True,
            "dynamic_volume": "MED",
            "ref_level_offset": 0,
            "eco_mode": "AUTO",
            "z2_power": False,
            "z2_volume": 30,
            "z2_muted": False,
            "z2_source": "TV",
            "surround_mode_list": [
                {"category": "MOV", "category_label": "Movie",      "id": "01", "active": False, "display_name": "Dolby Digital",  "command": "DOLBY DIGITAL"},
                {"category": "MOV", "category_label": "Movie",      "id": "02", "active": True,  "display_name": "Dolby Atmos",    "command": "DOLBY ATMOS"},
                {"category": "MOV", "category_label": "Movie",      "id": "03", "active": False, "display_name": "DTS:X",          "command": "DTS:X"},
                {"category": "MUS", "category_label": "Music",      "id": "01", "active": False, "display_name": "Stereo",         "command": "STEREO"},
                {"category": "MUS", "category_label": "Music",      "id": "02", "active": False, "display_name": "Multi Ch Stereo","command": "MCH STEREO"},
                {"category": "MUS", "category_label": "Music",      "id": "03", "active": False, "display_name": "DTS Neural:X",   "command": "NEURAL:X"},
                {"category": "GAM", "category_label": "Game",       "id": "01", "active": False, "display_name": "Video Game",     "command": "VIDEO GAME"},
                {"category": "PUR", "category_label": "Pure/Direct","id": "01", "active": False, "display_name": "Direct",         "command": "DIRECT"},
                {"category": "PUR", "category_label": "Pure/Direct","id": "02", "active": False, "display_name": "Pure Direct",    "command": "PURE DIRECT"},
            ],
        })

    async def connect(self) -> None:
        self._connected = True
        await self._notify()

    async def disconnect(self) -> None:
        self._shutting_down = True
        self._connected = False

    async def send(self, command: str) -> bool:
        if not self._connected:
            return False
        for response in self._simulate(command):
            await self._parse(response)
        return True

    # -- simulation --

    def _vol_str(self, vol: float) -> str:
        if vol % 1 == 0:
            return f"MV{int(vol)}"
        return f"MV{int(vol):02d}5"

    def _simulate(self, cmd: str) -> list[str]:  # noqa: C901
        s = self.state

        # Power
        if cmd == "PW?":
            return ["PWON" if (s["power"] or s["z2_power"]) else "PWSTANDBY"]
        if cmd == "ZM?":
            return ["ZMON" if s["power"] else "ZMOFF"]
        if cmd in ("ZMON", "ZMOFF"):
            return [cmd]

        # Volume
        if cmd == "MV?":
            return [self._vol_str(s["volume"]), f"MVMAX{int(s['volume_max'])}"]
        if cmd == "MVUP":
            new_vol = min(s["volume_max"], round(s["volume"] + 0.5, 1))
            return [self._vol_str(new_vol)]
        if cmd == "MVDOWN":
            new_vol = max(0, round(s["volume"] - 0.5, 1))
            return [self._vol_str(new_vol)]
        if cmd.startswith("MV") and not cmd.startswith("MVMAX") and cmd[2:].isdigit():
            return [cmd]

        # Mute
        if cmd == "MU?":
            return ["MUON" if s["muted"] else "MUOFF"]
        if cmd in ("MUON", "MUOFF"):
            return [cmd]

        # Source
        if cmd == "SI?":
            return [f"SI{s['source']}"]
        if cmd.startswith("SI") and len(cmd) > 2:
            return [cmd]

        # Surround mode
        if cmd == "MS?":
            return [f"MS{s['surround_mode']}"]
        if cmd.startswith("MS") and len(cmd) > 2:
            return [cmd]

        # Sound decoder
        if cmd == "SD?":
            return ["SDAUTO"]

        # Channel volumes
        if cmd == "CV?":
            return [f"CV{ch} {val}" for ch, val in s["channel_volumes"].items()] + ["CVEND"]
        if cmd == "CVZRL":
            return [f"CV{ch} 50" for ch in s["channel_volumes"]] + ["CVEND"]
        if cmd.startswith("CV") and " " in cmd:
            return [cmd]

        # Zone 2
        if cmd == "Z2?":
            result = ["Z2ON" if s["z2_power"] else "Z2OFF"]
            if s["z2_volume"] is not None:
                result.append(f"Z2{s['z2_volume']:02d}")
            if s["z2_source"]:
                result.append(f"Z2{s['z2_source']}")
            return result
        if cmd == "Z2MU?":
            return ["Z2MUON" if s["z2_muted"] else "Z2MUOFF"]
        if cmd == "Z2UP":
            new_vol = min(98, (s["z2_volume"] or 30) + 1)
            return [f"Z2{new_vol:02d}"]
        if cmd == "Z2DOWN":
            new_vol = max(0, (s["z2_volume"] or 30) - 1)
            return [f"Z2{new_vol:02d}"]
        if cmd.startswith("Z2"):
            return [cmd]  # Z2ON, Z2OFF, Z2MUON, Z2MUOFF, Z2<vol>, Z2<source>

        # Tone
        if cmd == "PSTONE CTRL ?":
            return [f"PSTONE CTRL {'ON' if s['tone_control'] else 'OFF'}"]
        if cmd.startswith("PSTONE CTRL"):
            return [cmd]
        if cmd == "PSBAS ?":
            return [f"PSBAS {s['bass']:02d}"]
        if cmd.startswith("PSBAS"):
            return [cmd]
        if cmd == "PSTRE ?":
            return [f"PSTRE {s['treble']:02d}"]
        if cmd.startswith("PSTRE"):
            return [cmd]

        # Subwoofer
        if cmd == "PSSWL ?":
            if s["subwoofer_level"] is None:
                return ["PSSWL OFF"]
            return [f"PSSWL {s['subwoofer_level']:02d}"]
        if cmd.startswith("PSSWL"):
            return [cmd]

        # Dialog level
        if cmd == "PSDIL ?":
            return ["PSDIL OFF"]
        if cmd.startswith("PSDIL"):
            return [cmd]

        # MultEQ
        if cmd == "PSMULTEQ: ?":
            return [f"PSMULTEQ:{s['multeq']}"]
        if cmd.startswith("PSMULTEQ:"):
            return [cmd]

        # Dynamic EQ
        if cmd == "PSDYNEQ ?":
            return [f"PSDYNEQ {'ON' if s['dynamic_eq'] else 'OFF'}"]
        if cmd.startswith("PSDYNEQ"):
            return [cmd]

        # Dynamic Volume
        if cmd == "PSDYNVOL ?":
            return [f"PSDYNVOL {s['dynamic_volume']}"]
        if cmd.startswith("PSDYNVOL"):
            return [cmd]

        # Reference level offset
        if cmd == "PSREFLEV ?":
            return [f"PSREFLEV {s['ref_level_offset']}"]
        if cmd.startswith("PSREFLEV"):
            return [cmd]

        # Sleep timer
        if cmd == "SLP?":
            return ["SLPOFF"]
        if cmd.startswith("SLP"):
            return [cmd]

        # Eco mode
        if cmd == "ECO?":
            return [f"ECO{s['eco_mode']}"]
        if cmd.startswith("ECO"):
            return [cmd]

        # Source function names
        if cmd == "SSFUN ?":
            return [f"SSFUN{code} {name}" for code, name in s["source_names"].items()] + ["SSFUNEND"]

        # Source on/delete list
        if cmd == "SSSOD ?":
            return ["SSSODEND"]

        # Friendly name
        if cmd == "NSFRN ?":
            return [f"NSFRN {s['friendly_name']}"]

        return []
