# Input Rename in UI

## Summary

Allow users to rename source inputs directly in the dashboard UI, without editing environment variables and restarting the container. Names persist in `localStorage`.

## Why

Currently, renaming sources requires:
1. Edit `DENON_DASHBOARD_SOURCE_NAMES` env var in `compose.yaml`
2. Restart the Docker container

With this feature, users click an edit icon on the source selector, type a new name, and it applies immediately across all clients on this browser.

## Implementation

### SourceSelector.jsx — Edit Mode

Add an edit mode toggle (pencil icon in the top-right of the SourceSelector card):

```
┌─ Source ─────────────────── ✏️ ──┐
│  [Game Console]  [Blu-ray] ...    │
│  [TV Audio]      [Streaming] ...  │
└───────────────────────────────────┘
```

When edit mode is on (`✏️` → active), each source button becomes editable:

```
┌─ Source ─────────────────── ✓ ───┐
│  [Game Console✎]  [Blu-ray✎]     │
│  [TV Audio✎]      [Streaming✎]   │
└───────────────────────────────────┘
```

Clicking a source label opens an inline input:
```
┌─ Source ─────────────────── ✓ ───┐
│  ┌───────────────────┐ [Blu-ray] │
│  │ Game Console      │           │
│  └───────────────────┘ [Stream.] │
│  [TV Audio]                      │
└───────────────────────────────────┘
```

Press Enter or click away → saves to localStorage. Click ✓ → exits edit mode.

### localStorage Structure

Key: `denon-source-names`

```json
{
  "GAME": "PlayStation 5",
  "BD": "4K Blu-ray",
  "TV": "Apple TV",
  "NET": "Streaming"
}
```

Merged at display time:
1. Start with `info.source_name_map` (env + discovered + defaults)
2. Override with localStorage values for matching keys
3. Result = displayed label

### Plumb through to SourceSelector

**Option A (simplest):** SourceSelector loads localStorage directly. No backend changes needed.

**Option B (cleaner):** Add a `sourceOverride` state in App.jsx, pass down. App handles the merge.

Go with **Option A** — it's a purely visual override, no API involved. The localStorage key is the source of truth for display names.

### Reset to default

Long-press or right-click a source name → "Reset to default" option that removes the localStorage entry for that source.

### Zone 2

Same edit functionality in Zone2Controls source selector. Both zones share the same localStorage key (a source is the same physical input regardless of zone).

## Implementation Notes

- The actual protocol code (`SI<CODE>`) never changes — only the display label
- `DeviceInfoResponse.source_name_map` already merges env + discovered + defaults → localStorage is a fourth layer on top
- No API changes, pure frontend

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/SourceSelector.jsx` | Add edit mode, inline rename, localStorage read/write |
| `frontend/src/components/Zone2Controls.jsx` | Same edit mode (or extract shared `EditableSourceGrid` component) |

## Effort

~1 hour. Pure frontend, no backend changes.
