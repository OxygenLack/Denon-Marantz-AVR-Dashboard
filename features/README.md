# Feature Plans — Denon Dashboard

| # | Feature | File | Priority | Effort |
|---|---------|------|----------|--------|
| 1 | **Night Mode** (speaker level presets) | [`01-night-mode.md`](01-night-mode.md) | 🔴 Highest | ~3h |
| 2 | Zone 2 Sleep Timer | [`02-zone2-sleep-timer.md`](02-zone2-sleep-timer.md) | 🟠 High | ~30m |
| 3 | Keyboard Shortcuts | [`03-keyboard-shortcuts.md`](03-keyboard-shortcuts.md) | 🟠 High | ~20m |
| 4 | PWA Support | [`04-pwa.md`](04-pwa.md) | 🟡 Medium | ~30m |
| 5 | Input Rename in UI | [`05-input-rename.md`](05-input-rename.md) | 🟡 Medium | ~1h |
| 6 | HEOS Queue Display | [`06-heos-queue.md`](06-heos-queue.md) | 🟢 Low* | ~2h |
| — | CEC Passthrough | [`cec-passthrough-cut.md`](cec-passthrough-cut.md) | ❌ Cut | — |

\* HEOS queue only works for local music (DLNA/USB). Backend worth doing; frontend deferred.

## Implementation Order

```
1. Night Mode        ← start here
2. Zone 2 Sleep      ← quick win
3. Keyboard Shortcuts ← quick win
4. PWA               ← quick, nice mobile improvement
5. Input Rename      ← solves real pain point
6. HEOS Queue        ← backend first, frontend if needed
```

## Dynamic Channel Handling

All features that deal with speaker channels (Night Mode, channel levels, etc.) use `Object.keys(state.channel_volumes)` — whatever the receiver reports via `CV?`. No hardcoded channel lists. Works for 5.1, 7.1.4, 9.2.2, and beyond.

The `CHANNEL_NAMES` map in `const.py` covers 28 channel codes including heights, tops, wides, Dolby-enabled, and surround backs.
