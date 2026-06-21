# Night Mode (Speaker Level Presets)

## Summary

Toggle that reduces specific speaker levels for night listening. Restores original levels when disabled. Works with any speaker layout (5.1, 7.1.4, 9.2.2, etc.) — channels are discovered dynamically from the receiver.

Each channel can be configured individually: absolute target or dB offset. Configuration persists in `localStorage`.

## User Flow

1. User opens Night Mode settings panel (from Speakers tab or header toggle)
2. Sees all active speaker channels listed (dynamically from `CV?`)
3. For each channel: checkbox to include, dropdown "Absolute" or "Offset", value input
4. Current real level shown next to each row as `← 52`
5. Saves preset → stored in localStorage
6. Taps moon icon in header → all configured channels switch to night values
7. Taps again → all channels restored to pre-night levels

## Backend

### New endpoint: `POST /api/v1/night-mode`

**File:** `backend/routes/audio.py`

**Request:**
```json
{
  "enabled": true,
  "channels": [
    {"channel": "SW",  "mode": "absolute", "value": 38},
    {"channel": "SW2", "mode": "absolute", "value": 40},
    {"channel": "FL",  "mode": "offset",   "value": -4},
    {"channel": "FR",  "mode": "offset",   "value": -4}
  ]
}
```

**Logic:**
- **Enable:**
  1. Read current `channel_volumes` from `app_state.telnet.state`
  2. Store snapshot in `app_state.night_mode_snapshot = {ch: level, ...}`
  3. For each configured channel:
     - `absolute`: send `CV<CH> <value>` (clamp 38–62)
     - `offset`: compute `current + offset`, clamp 38–62, send `CV<CH> <computed>`
  4. Set `app_state.night_mode_enabled = True`
  5. Broadcast state

- **Disable:**
  1. For each channel in `night_mode_snapshot`, send `CV<CH> <snapshot_value>`
  2. Clear snapshot, set `night_mode_enabled = False`
  3. Broadcast state

**Error handling:**
- Receiver disconnected → 503
- Channel not in current `channel_volumes` → skip with warning log
- Value out of range after offset → clamp, log warning, apply clamped value

### New model: `NightModeRequest`

**File:** `backend/api/models.py`

```python
class NightModeChannel(BaseModel):
    channel: str = Field(..., pattern=r"^[A-Z0-9]{1,4}$")
    mode: Literal["absolute", "offset"]
    value: int  # absolute target (38-62) or offset (-24 to +24, applied with clamping)

class NightModeRequest(BaseModel):
    enabled: bool
    channels: list[NightModeChannel] = []
```

### State additions

**File:** `backend/state.py` — `AppState.__init__`:

```python
self.night_mode_enabled: bool = False
self.night_mode_snapshot: dict[str, int] = {}
```

**`build_status()`** — add:
```python
"night_mode_enabled": self.night_mode_enabled,
"night_mode_snapshot": self.night_mode_snapshot,
```

### Telnet command handling

All commands go through existing `telnet_client.send()`. The `COMMAND_INTERVAL` (50ms) between commands handles pacing. For N channels, expect ~N × 50ms delay — acceptable for 5–15 channels (250–750ms total).

## Frontend

### New component: `NightModePanel.jsx`

**Location:** `frontend/src/components/NightModePanel.jsx`

**Layout:**
```
┌─ Night Mode ──────────────────── 🌙 ON ───┐
│                                            │
│  ☑ Subwoofer      Absolute ▼  [38]  ← 52  │
│  ☑ Subwoofer 2    Absolute ▼  [40]  ← 54  │
│  ☑ Front Left     Offset   ▼  [-4]  ← 50  │
│  ☑ Front Right    Offset   ▼  [-4]  ← 50  │
│  ☐ Center                             50   │
│  ☐ Surround L                         48   │
│  ☐ Surround R                         48   │
│  ☐ Front Height L                     50   │
│  ☐ Front Height R                     50   │
│                                            │
│  [Save as Preset]     [Reset All]          │
└────────────────────────────────────────────┘
```

**Data source:**
- Channels: `Object.entries(state.channel_volumes)` — fully dynamic
- Labels: `info.channel_names[code]` or fallback to code
- Current levels: shown as `← N` (snapshot value if night mode is on)

**State management:**
- Config stored in `localStorage` key `denon-night-mode-config`
- Format: `{ channels: { SW: {mode: "absolute", value: 38}, FL: {mode: "offset", value: -4}, ... } }`
- On mount, load from localStorage and filter out channels no longer present in `state.channel_volumes`
- On save, persist to localStorage

**Toggle behavior:**
- Header moon icon calls `POST /api/v1/night-mode` with the saved config
- Shows loading spinner during apply (N channels × 50ms)
- If receiver is off → show toast "Receiver not available"

### Integration: `App.jsx`

- Moon icon toggle added to `StatusBar` (visible when at least one channel is configured)
- `NightModePanel` added to Speakers tab, below ChannelLevels and SubwooferLevel
- Pass `state`, `post`, `info` as props

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Receiver off when toggling | 503 → toast, don't change toggle state |
| Channel disappeared (e.g., sub unplugged) | Skip on apply, remove from localStorage config after 2 consecutive polls missing |
| User manually changes level during night mode | Snapshot NOT updated. Restore returns to pre-night value |
| Offset computes outside 38–62 | Clamp, log warning, apply clamped value |
| No channels configured | Moon icon hidden, no-op if somehow triggered |
| Rapid toggle on/off | Second call waits for first to complete (disable + enable in quick succession works — each is atomic) |

## Files to Create/Modify

| File | Action |
|------|--------|
| `backend/api/models.py` | Add `NightModeChannel`, `NightModeRequest` |
| `backend/routes/audio.py` | Add `POST /night-mode` endpoint |
| `backend/state.py` | Add `night_mode_enabled`, `night_mode_snapshot`, update `build_status()` |
| `frontend/src/components/NightModePanel.jsx` | **Create** |
| `frontend/src/App.jsx` | Wire component into Speakers tab |
| `frontend/src/components/StatusBar.jsx` | Add moon icon toggle |

## Tests

- `tests/test_night_mode.py`:
  - Enable with absolute channels → verify correct CV commands sent
  - Enable with offset channels → verify computed values correct
  - Disable → verify snapshot restored
  - Disconnected receiver → 503
  - Offset clamping at boundaries
  - Empty channels array → no-op
