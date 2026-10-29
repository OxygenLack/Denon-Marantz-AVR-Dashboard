# Feature Plans — Denon Dashboard

| # | Feature | File | Status |
|---|---------|------|--------|
| 1 | **Night Mode** (speaker level presets) | [`01-night-mode.md`](01-night-mode.md) | ✅ Done |
| 2 | Zone 2 Sleep Timer | [`02-zone2-sleep-timer.md`](02-zone2-sleep-timer.md) | ✅ Done |
| 3 | Keyboard Shortcuts | [`03-keyboard-shortcuts.md`](03-keyboard-shortcuts.md) | ✅ Done |
| 4 | PWA Support | [`04-pwa.md`](04-pwa.md) | ✅ Done — manifest only; the service worker is a kill-switch by design (cached bundles stranded clients once, see `CacheReset.tsx`) |
| 5 | Input Rename in UI | [`05-input-rename.md`](05-input-rename.md) | ✅ Done |
| 6 | HEOS Queue Display | [`06-heos-queue.md`](06-heos-queue.md) | ⏳ Open (low value: queue only exists for local DLNA/USB playback) |
| — | CEC Passthrough | [`cec-passthrough-cut.md`](cec-passthrough-cut.md) | ❌ Cut |

## Backlog / won't do

Items raised by audits that are deliberately not planned. The threat model is an
internal-only LAN deployment without authentication (see the security notes in the
README), so most "hardening" items buy nothing here.

| Item | Decision | Why |
|---|---|---|
| REST rate limiting | Won't do | Trusted LAN, one household; the WebSocket already rate-limits per client |
| Authentication / CSRF tokens | Won't do | Accepted design: no auth on the LAN; a reverse proxy adds SSO if wanted |
| Hide `receiver_ip` from `/health` | Won't do | The IP is the receiver's LAN address, visible to every client anyway |
| HEOS queue (feature 06) | Open, unscheduled | Only populated for local music; not worth a UI |
| Surround-mode presets | Won't do | The receiver's own `OPSMLALL` list is already exposed with one tap per mode |
| Env-configurable HEOS sid map | Won't do | HEOS sids are fixed per service; the built-in map in `denon/heos_media.py` covers them |
| `VOLUME_MAX` setting | Won't do | The receiver reports its own limit via `MVMAX` (`volume_max` in the state) |
| Narrow the discovery 172.x filter | Won't do | Inside a container 172.16/12 is almost always a Docker network; narrowing it would scan those instead of the LAN |

## Dynamic Channel Handling

All features that deal with speaker channels (Night Mode, channel levels, etc.) use `Object.keys(state.channel_volumes)` — whatever the receiver reports via `CV?`. No hardcoded channel lists. Works for 5.1, 7.1.4, 9.2.2, and beyond.

Display order comes from `/api/v1/device` `channel_names`, which the backend emits in the canonical `CHANNEL_NAMES` order (FL, FR, C, SW, …); the frontend sorts with `utils/channels.ts` `orderChannels()` and appends codes it does not know in receiver order.

The `CHANNEL_NAMES` map in `const.py` covers 28 channel codes including heights, tops, wides, Dolby-enabled, and surround backs.
