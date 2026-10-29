#!/usr/bin/env bash
# Route smoke test against a demo-mode backend (no receiver involved).
#
# Starts uvicorn with DENON_DASHBOARD_DEMO_MODE=true on $SMOKE_PORT (default
# 8766), curls every route from the README API tables and prints
# "METHOD PATH STATUS" per line. Compare the output before and after a
# refactor: the status codes must be identical.
#
#   scripts/smoke-routes.sh > /tmp/before.txt   # on the old tree
#   scripts/smoke-routes.sh > /tmp/after.txt    # on the new tree
#   diff /tmp/before.txt /tmp/after.txt
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_PORT:-8766}"
PY="${PYTHON:-$ROOT/backend/venv315/bin/python}"
[ -x "$PY" ] || PY=python3
BASE="http://127.0.0.1:$PORT"
DATA_DIR="$(mktemp -d)"

cd "$ROOT/backend"
DENON_DASHBOARD_DEMO_MODE=true DENON_DASHBOARD_LOG_LEVEL=ERROR DENON_DASHBOARD_DATA_DIR="$DATA_DIR" \
  "$PY" -m uvicorn main:app --port "$PORT" --log-level error >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null; rm -rf "$DATA_DIR"' EXIT

for _ in $(seq 1 50); do
  curl -s -o /dev/null "$BASE/api/v1/health" && break
  sleep 0.2
done

req() {  # METHOD PATH [JSON]
  local m="$1" p="$2" body="${3:-}"
  local code
  if [ -n "$body" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" -H 'Content-Type: application/json' -d "$body" "$BASE$p")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$p")
  fi
  printf '%-6s %-45s %s\n' "$m" "$p" "$code"
}

# Status and setup
req GET  /api/v1/health
req GET  /api/v1/status
req GET  /api/v1/device
req GET  /api/v1/channels
req POST /api/v1/refresh
req POST /api/v1/command '{"command":"MV?"}'
req POST /api/v1/ui-settings '{"theme":"purple"}'
req GET  /metrics
# (GET /api/v1/discover and POST /api/v1/connect touch the network: skipped)

# Main zone
req POST /api/v1/power/on
req POST /api/v1/power/toggle
req POST /api/v1/power/off
req POST /api/v1/power/on
req POST /api/v1/volume '{"level":45}'
req POST /api/v1/volume/up
req POST /api/v1/volume/down
req POST /api/v1/mute/on
req POST /api/v1/mute/off
req POST /api/v1/mute/toggle
req POST /api/v1/mute/off
req POST /api/v1/source '{"source":"GAME"}'
req POST /api/v1/source-names/GAME '{"name":"Console"}'
req DELETE /api/v1/source-names/GAME
req POST /api/v1/surround '{"mode":"STEREO"}'
req POST /api/v1/sleep '{"minutes":30}'

# Speakers and audio
req POST /api/v1/channel-volume '{"channel":"C","level":48}'
req POST /api/v1/channel-volume/reset
req POST /api/v1/night-mode '{"enabled":true,"channels":[{"channel":"SW","mode":"absolute","value":40}]}'
req POST /api/v1/night-mode '{"enabled":false,"channels":[]}'
req GET  /api/v1/night-mode/config
req POST /api/v1/night-mode/config '{"mode":"offset","schedule":{"enabled":false,"days":[],"start":"22:00","end":"02:00","timezone":"Europe/Berlin"},"channels":[]}'
req POST /api/v1/subwoofer-level '{"level":50}'
req POST /api/v1/tone '{"enabled":true,"bass":52,"treble":48}'
req POST /api/v1/multeq '{"mode":"AUDYSSEY"}'
req POST /api/v1/dynamic-eq '{"enabled":true}'
req POST /api/v1/dynamic-volume '{"mode":"MED"}'
req POST /api/v1/eco '{"mode":"AUTO"}'

# Zone 2
req POST /api/v1/zone2/power/on
req POST /api/v1/zone2/volume '{"level":35}'
req POST /api/v1/zone2/volume/up
req POST /api/v1/zone2/volume/down
req POST /api/v1/zone2/mute/on
req POST /api/v1/zone2/mute/off
req POST /api/v1/zone2/source '{"source":"NET"}'
req POST /api/v1/zone2/power/off

# Media (HEOS) - demo mode has no HEOS client: 503 is the expected answer
req POST /api/v1/media/play
req POST /api/v1/media/pause
req POST /api/v1/media/stop
req POST /api/v1/media/next
req POST /api/v1/media/previous
req GET  /api/v1/media/now-playing

# Internet radio
req GET  /api/v1/media/radio/browse
req GET  "/api/v1/media/radio/search?q=jazz+berlin"
req GET  /api/v1/media/radio/status
req POST /api/v1/media/radio/play '{"mid":"s280354"}'
req POST /api/v1/media/radio/refresh
req GET  /api/v1/media/radio/favorites
req POST /api/v1/media/radio/favorites '{"mid":"s280354","name":"Radio Paradise"}'
req DELETE /api/v1/media/radio/favorites/s280354

# SPA / static
req GET  /
req GET  /nonexistent-route
