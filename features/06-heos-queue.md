# HEOS Queue Display

## Summary

Show the current HEOS playback queue (track list) in a new expandable panel or tab. Let users see what's coming up next and jump to a specific track.

## What Works (and What Doesn't)

The HEOS CLI command `player/get_queue?pid=<id>` returns the current queue. But:

| Source | Queue available? | Notes |
|--------|:---:|-------|
| TuneIn / Internet Radio | No | Live stream, no queue |
| Spotify Connect | No | Spotify manages its own queue internally |
| Bluetooth | No | Passthrough audio |
| DLNA / Local Music (SERVER) | **Yes** | Full track list |
| USB | **Yes** | Track list |
| HEOS Favorites playlists | **Yes** | Playlist contents |
| HEOS History | **Yes** | Recently played |
| Amazon Music / Tidal / Deezer | **Maybe** | HEOS app manages queue, protocol support varies |

**Bottom line:** This is most useful for local music libraries (DLNA/NAS/SMB shares) and USB playback. For Spotify/TuneIn/Bluetooth users, it shows nothing.

## Backend

### New HEOS method: `get_queue`

**File:** `backend/denon/heos_client.py`

```python
async def get_queue(self) -> list[dict[str, Any]]:
    """Return current playback queue. Empty list if no queue available."""
    resp = await self._command("player/get_queue", self._pid_param())
    if resp and "payload" in resp:
        return resp["payload"]
    return []
```

Typical response item:
```json
{
  "song": "Track Name",
  "album": "Album Name",
  "artist": "Artist Name",
  "image_url": "http://...",
  "mid": "some-media-id",
  "qid": 1
}
```

### New endpoint: `GET /api/v1/media/queue`

**File:** `backend/routes/media.py`

```python
@router.get("/queue")
async def media_queue():
    """Return current HEOS playback queue (empty for streaming sources)."""
    if not app_state.heos:
        raise HTTPException(503, "HEOS not connected")
    queue = await app_state.heos.get_queue()
    return {"queue": queue, "total": len(queue)}
```

### Polling integration

Add queue polling to the existing `_poll_media()` background task in `state.py`:

```python
# In _poll_media():
queue = await self.heos.get_queue()
new_state = {"now_playing": now_playing, "play_state": play_state, "queue": queue}
```

Add `queue` to `build_status()`.

## Frontend

### New component: `QueuePanel.jsx`

**File:** `frontend/src/components/QueuePanel.jsx`

Layout: a new tab or expandable section in the Controls area.

When queue is empty:
```
┌─ Queue ─────────────────────────────────────┐
│  No queue available for this source.        │
│  Works with local music (DLNA/USB).         │
└─────────────────────────────────────────────┘
```

When queue has items:
```
┌─ Queue (14 tracks) ─────────────────────────┐
│  #1  ▶ Bohemian Rhapsody          Queen     │
│       A Night at the Opera                   │
│  #2    Another One Bites the Dust Queen     │
│       The Game                              │
│  #3    Don't Stop Me Now           Queen     │
│       Jazz                                  │
│  ...                                        │
└─────────────────────────────────────────────┘
```

- Currently playing track highlighted with ▶ indicator
- Click a track to jump to it: `POST /api/v1/media/queue/play` with `{qid: 3}`
- Show album art thumbnail if `image_url` is available
- Scrollable if >10 tracks

### Jump to track endpoint

**File:** `backend/routes/media.py`

```python
class QueuePlayRequest(BaseModel):
    qid: int = Field(..., ge=1)

@router.post("/queue/play")
async def queue_play(req: QueuePlayRequest):
    if not app_state.heos:
        raise HTTPException(503, "HEOS not connected")
    ok = await app_state.heos._command("player/play_queue", f"{app_state.heos._pid_param()}&qid={req.qid}")
    if not ok or ok.get("heos", {}).get("result") != "success":
        raise HTTPException(502, "Failed to play queue item")
    return {"ok": True}
```

### Integration: App.jsx

Add "Queue" tab to the main sections array (next to Controls / Speakers / Audio EQ):

```jsx
const mainSections = [
  { id: 'controls', label: 'Controls' },
  { id: 'queue',    label: 'Queue' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'audio',    label: 'Audio / EQ' },
]
```

## Decision: Worth It?

If Kevin uses local music (DLNA/NAS) or USB playback regularly → yes.
If primarily Spotify/TuneIn → skip this, the queue will always be empty.

**Recommendation:** Implement the backend endpoint + `get_queue()` method (small effort, adds capability), but hold the frontend QueuePanel until there's demand. The data is available via API for future use.

## Files to Create/Modify

| File | Action |
|------|--------|
| `backend/denon/heos_client.py` | Add `get_queue()` method |
| `backend/routes/media.py` | Add `GET /queue` and `POST /queue/play` |
| `backend/state.py` | Add queue to `_poll_media()` and `build_status()` |
| `frontend/src/components/QueuePanel.jsx` | **Create** (deferred — see decision above) |
| `frontend/src/App.jsx` | Add Queue tab (deferred) |

## Effort

~1 hour backend, ~1 hour frontend.
