# CLAUDE.md - Denon Dashboard

This file provides context for AI assistants (Claude, Codex, etc.) working on this project.

## Project Overview

A web dashboard for controlling Denon/Marantz AVR receivers and Android TV / Google TV devices. Single Docker container serving a React frontend + FastAPI backend.

## Architecture

```
frontend/ (React 19 + Vite + Tailwind)
  src/
    App.jsx              -> Top-level tab selector and section routing
    hooks/
      useWebSocket.js    -> WebSocket client, state management
      useApi.js          -> REST API helper (POST)
      useDeviceInfo.js   -> Fetches /api/v1/device on mount
    components/
      StatusBar.jsx       -> Header + expandable health panel
      PowerControl.jsx    -> Zone-aware receiver power
      VolumeControl.jsx   -> Receiver volume slider + buttons + mute
      MediaControls.jsx   -> HEOS play/pause/next/prev + now playing
      SourceSelector.jsx  -> Receiver source grid
      SurroundMode.jsx    -> Receiver surround mode dropdown
      ChannelLevels.jsx   -> Per-speaker trim + calibration
      SubwooferLevel.jsx  -> Subwoofer trim slider
      ToneControls.jsx    -> Bass/treble
      AudioSettings.jsx   -> MultEQ, DynEQ, DynVol, eco
      Zone2Controls.jsx   -> Zone 2 power, volume, media, source
      AndroidTvRemote.jsx -> Android TV pairing and remote control

backend/
  main.py               -> FastAPI app, lifespan, routers, WebSocket
  config.py             -> Pydantic settings (DENON_DASHBOARD_ prefix)
  api/models.py         -> Shared request/response Pydantic models
  denon/
    const.py            -> Receiver protocol constants and source defaults
    telnet_client.py    -> Async telnet: connect, parse, reconnect, heartbeat
    heos_client.py      -> HEOS CLI: media transport, now playing
  androidtv/
    discovery.py        -> mDNS discovery for Android TV Remote v2
    remote_client.py    -> Stateful Android TV Remote v2 client wrapper
  routes/
    androidtv.py        -> Android TV REST endpoints
```

## Key Protocol Details

- **Denon telnet** (port 23): `\r` terminator, 50ms command interval.
- **HEOS CLI** (port 1255): JSON over TCP, `\r\n` terminator.
- **Android TV Remote v2**: port 6466 for commands, port 6467 for pairing.
- **Android TV pairing**: client certificate/key and the last connected host are stored in `DENON_DASHBOARD_ANDROID_TV_STORAGE_DIR`.
- **PW vs ZM**: `PWON` = system power, `ZMON`/`ZMOFF` = main zone only.
- **Receiver volume**: 0-98 scale, 80 = 0dB. Three-digit for half steps (805 = 80.5).
- **Channel volume**: 38-62 range, 50 = 0dB trim on top of Audyssey calibration.
- **Source codes**: GAME, MPLAY, TV, NET, 8K, BD, etc. mapped to display names via env config.

## State Flow

1. Receiver telnet and Android TV clients maintain independent runtime state.
2. `AppState.build_status()` emits the legacy receiver fields plus an `android_tv` object.
3. `broadcast_state()` pushes the full state to all WebSocket clients.
4. Frontend tabs render from the same WebSocket payload.
5. User actions call REST endpoints; backend sends the device command; callbacks and polls update state.
6. Android TV startup connects to `ANDROID_TV_HOST` or the persisted last connected host.

## Speaker Calibration

- Audyssey calibration offsets are fetched from the receiver HTTP API at startup (`/ajax/speakers/get_config?type=5`).
- Stored as `speaker_calibration` dict (channel -> dB offset).
- Frontend shows effective level = calibration + trim.

## Environment Variables

All prefixed with `DENON_DASHBOARD_`. See README for the full list.
Key values: `DENON_HOST`, `ANDROID_TV_HOST`, `ANDROID_TV_STORAGE_DIR`, `DENON_SOURCE_NAMES`, zone/device names, theme.

## Build & Deploy

- Multi-stage Dockerfile: node:22-alpine (frontend build) -> python:3.13-slim (runtime).
- Container serves frontend static files from FastAPI.
- The Docker compose example mounts `/data` for Android TV pairing data while keeping the container read-only.

## Common Tasks

- **Add a new API endpoint**: Add a router in `backend/routes/`, include it in `main.py`, and add models in `api/models.py` when shared.
- **Add a new telnet response**: Add parsing in `denon/telnet_client.py._parse()`, add to the receiver state dict.
- **Add Android TV remote behavior**: Extend `androidtv/remote_client.py` and expose a narrow endpoint in `routes/androidtv.py`.
- **Add a new UI component**: Create in `frontend/src/components/`, wire into `App.jsx`.
- **Add a new receiver source**: Add to `DENON_SOURCE_NAMES` env var.
- **Debug**: Set `DENON_DASHBOARD_LOG_LEVEL=DEBUG`.
