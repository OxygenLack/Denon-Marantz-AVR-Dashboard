# CEC Passthrough — Cut

## Verdict: Not feasible through the Denon telnet protocol.

## Investigation

Checked the Denon IP protocol documentation (`IP_Protocol_AVR-Xx100.pdf` in repo root) and the existing `const.py` command set.

### What exists

- `PSCEC` — CEC power control setting (ON/OFF). Controls whether the receiver responds to CEC power commands from the TV. Already settable in receiver's own menu.
- That's it.

### What doesn't exist

- No raw CEC frame passthrough command
- No "send CEC command to device X" endpoint
- No CEC routing/switching control
- No CEC device discovery via telnet

### Why not

CEC is handled internally by the receiver's HDMI board. The telnet protocol exposes receiver-specific controls (power, volume, sources, audio settings), not HDMI-CEC bus management. Sending arbitrary CEC frames would require direct HDMI bus access, which only the receiver's firmware has.

### Alternatives

- **Home Assistant** has a CEC integration that works through HDMI-CEC USB adapters (Pulse-Eight). Much better fit.
- **HDMI-CEC via TV** — most modern TVs can relay CEC commands. If the TV has an API (LG WebOS, Samsung Tizen), that's the path.

## Conclusion

This feature is cut. The protocol doesn't support it. Not worth a workaround.
