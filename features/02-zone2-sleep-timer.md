# Zone 2 Sleep Timer Exposure

## Summary

The receiver already reports Zone 2 sleep timer via telnet (`Z2SLP` responses). The backend ignores these. Parse, store, and display them in the Zone 2 controls UI.

## Current State

**`telnet_client._parse()`** (line ~350) — receives `Z2SLP` lines but has:
```python
elif line.startswith("Z2SLP"):
    # Zone 2 sleep timer — ignore for now (not exposed in UI)
    pass
```

**`build_status()`** — no `z2_sleep_timer` field.

## Backend

### Parse Z2SLP

**File:** `backend/denon/telnet_client.py` — `_parse()`

Replace the `pass` block:
```python
elif line.startswith("Z2SLP"):
    val = line[4:].strip()
    if val == "OFF":
        self.state["z2_sleep_timer"] = None; changed = True
    else:
        try:
            self.state["z2_sleep_timer"] = int(val); changed = True
        except ValueError:
            pass
```

### Add to state init

**File:** `backend/denon/telnet_client.py` — `__init__` state dict:
```python
"z2_sleep_timer": None,
```

### Add to query commands

**File:** `backend/denon/const.py` — `QUERY_COMMANDS`:
```python
"Z2SLP?",
```

### Expose in build_status and models

**File:** `backend/state.py` — `build_status()`:
```python
"z2_sleep_timer": state.get("z2_sleep_timer"),
```

**File:** `backend/api/models.py` — `StatusResponse`:
```python
z2_sleep_timer: int | None = None
```

## Frontend

### Zone2Controls.jsx

Add a sleep timer row below the volume/mute controls:
```
┌─ Zone 2 ────────────────────────────────────┐
│  ...existing controls...                     │
│                                              │
│  Sleep Timer:  [ 30 min ▼ ]  [Set] [Off]    │
│  (shows "Off" when None, countdown when set) │
└──────────────────────────────────────────────┘
```

- Dropdown: OFF, 10, 20, 30, 60, 90, 120 min
- Send `Z2SLP<minutes>` or `Z2SLPOFF` via WebSocket command
- Display current value from `state.z2_sleep_timer`

## Files to Modify

| File | Change |
|------|--------|
| `backend/denon/telnet_client.py` | Parse `Z2SLP`, add to state init |
| `backend/denon/const.py` | Add `Z2SLP?` to `QUERY_COMMANDS` |
| `backend/state.py` | Add to `build_status()` |
| `backend/api/models.py` | Add to `StatusResponse` |
| `frontend/src/components/Zone2Controls.jsx` | Add sleep timer UI |

## Effort

~30 minutes. Pure wiring of already-transmitted data.
