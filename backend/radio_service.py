"""TuneIn radio browse cache and the supervised station preload.

Not a route module on purpose: `state.py` starts the preload after every HEOS
connect and `routes/media.py` serves it, and a route module importing `state`
while `state` imports the route module would be a cycle.

Preload model (single-flight, supervised):

- `ensure_radio_preload()` starts a preload only when none is running, nothing
  is cached yet, and the retry backoff allows it. Every caller (HEOS connect,
  `/radio/refresh`, the 30 s media resync) goes through it, so there is never
  more than one `_preload_task`. Until 2026-10 `/radio/refresh` spawned an
  unreferenced task per call and a preload skipped because the AVR was in
  standby was never retried.
- A preload that finds HEOS down or 0 stations schedules a retry: 1, 2, 5,
  10 min, then every 30 min. Success or `/radio/refresh` resets the backoff.
- `cancel_preload()` is called from the lifespan shutdown.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from state import app_state

_LOGGER = logging.getLogger("radio")

TUNEIN_SID = 3
_CACHE_TTL = 3600  # 1 hour
_MAX_CACHE_ITEMS = 500
PRELOAD_DELAY = 10.0  # seconds to let HEOS settle after connect

# Retry backoff after a preload that cached nothing (seconds).
BACKOFF_STEPS: tuple[float, ...] = (60, 120, 300, 600)
BACKOFF_MAX = 1800.0

_BROWSE_CACHE: dict[str, tuple[float, dict]] = {}  # key -> (timestamp, result)
_preload_task: asyncio.Task | None = None
_preload_done = False
_rerun_requested = False
_cached_station_count = 0
_attempts = 0
_next_attempt_at = 0.0  # monotonic


def _clock() -> float:
    """Monotonic clock; module-level so tests can monkeypatch it."""
    return time.monotonic()


# -- read-only views -----------------------------------------------------------

def cached_station_count() -> int:
    return _cached_station_count


def cache_entries() -> int:
    """Number of cached browse results (for /metrics)."""
    return len(_BROWSE_CACHE)


def is_preloading() -> bool:
    return _preload_task is not None and not _preload_task.done()


def preload_done() -> bool:
    return _preload_done


# -- cache ---------------------------------------------------------------------

async def cache_browse(cid: str | None = None) -> dict:
    """Browse and cache a single CID. Returns the result."""
    cache_key = cid or "__root__"
    now = _clock()
    if cache_key in _BROWSE_CACHE:
        ts, cached = _BROWSE_CACHE[cache_key]
        if now - ts < _CACHE_TTL and cached.get("items"):
            return cached
    if not app_state.heos:
        return {"items": [], "count": 0, "returned": 0, "_debug": "no_heos"}
    result = await app_state.heos.browse_source(TUNEIN_SID, cid)
    if result.get("items"):
        if len(_BROWSE_CACHE) >= _MAX_CACHE_ITEMS:
            oldest_key = min(_BROWSE_CACHE.keys(), key=lambda k: _BROWSE_CACHE[k][0])
            _BROWSE_CACHE.pop(oldest_key, None)
        _BROWSE_CACHE[cache_key] = (now, result)
    return result


def _playable_stations():
    """Every cached playable station item (may repeat across categories)."""
    for _, data in _BROWSE_CACHE.values():
        for item in data.get("items", []):
            if item.get("playable") == "yes" and item.get("mid"):
                yield item


def _count_unique_stations() -> int:
    return len({item["mid"] for item in _playable_stations()})


def search_stations(query: str) -> list[dict[str, Any]]:
    """Search all cached playable stations; every word must match the name."""
    global _cached_station_count
    words = query.split()
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in _playable_stations():
        if item["mid"] in seen:
            continue
        name_lower = item.get("name", "").lower()
        if all(w in name_lower for w in words):
            results.append(item)
            seen.add(item["mid"])

    _cached_station_count = _count_unique_stations()
    return results


# -- preload -------------------------------------------------------------------

def reset() -> None:
    """Clear the cache and the backoff so the next ensure_radio_preload() starts fresh.

    If a preload is running it keeps running; it is re-run once more when it
    finishes, so entries it cached before the reset are not lost for good.
    """
    global _preload_done, _cached_station_count, _attempts, _next_attempt_at, _rerun_requested
    _BROWSE_CACHE.clear()
    _preload_done = False
    _cached_station_count = 0
    _attempts = 0
    _next_attempt_at = 0.0
    if is_preloading():
        _rerun_requested = True


def ensure_radio_preload() -> bool:
    """Start a preload if none runs, nothing is cached and the backoff allows it.

    Returns True when a task was started. Safe to call from any task on every
    tick; it is a cheap no-op in the steady state.
    """
    global _preload_task
    if is_preloading():
        _LOGGER.info("Radio preload: already running, not starting a second one")
        return False
    if _preload_done:
        return False
    if _clock() < _next_attempt_at:
        return False
    if _attempts:
        _LOGGER.info("Radio preload: no stations cached, retrying (attempt %d)", _attempts + 1)
    _preload_task = asyncio.create_task(preload_radio_stations())
    _preload_task.add_done_callback(_on_preload_done)
    return True


def _on_preload_done(_task: asyncio.Task) -> None:
    global _rerun_requested
    if _rerun_requested:
        _rerun_requested = False
        ensure_radio_preload()


async def cancel_preload() -> None:
    """Cancel a running preload (lifespan shutdown)."""
    global _preload_task
    task = _preload_task
    _preload_task = None
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def _schedule_retry(why: str) -> None:
    global _attempts, _next_attempt_at
    _attempts += 1
    delay = BACKOFF_STEPS[_attempts - 1] if _attempts <= len(BACKOFF_STEPS) else BACKOFF_MAX
    _next_attempt_at = _clock() + delay
    _LOGGER.info("Radio preload: %s, next attempt in %ds", why, int(delay))


async def preload_radio_stations() -> None:
    """Preload Local Radio, Trending and the Music genres into the cache.

    Runs as `_preload_task`; start it via `ensure_radio_preload()`.
    """
    global _preload_done, _cached_station_count, _attempts
    if _preload_done:
        return
    try:
        await asyncio.sleep(PRELOAD_DELAY)
        if not app_state.heos or not app_state.heos.connected:
            _schedule_retry("HEOS not connected, skipping")
            return

        _LOGGER.info("Radio preload: starting...")
        t0 = time.time()
        total = 0

        top = await cache_browse()
        if not top.get("items"):
            _schedule_retry("no top-level categories")
            return

        # Preload Local Radio + Trending (direct station lists)
        for cat_name in ("Local Radio", "Trending"):
            cat = next((i for i in top["items"] if cat_name in i.get("name", "")), None)
            if cat and cat.get("cid"):
                result = await cache_browse(cat["cid"])
                n = len([i for i in result.get("items", []) if i.get("playable") == "yes"])
                total += n
                _LOGGER.info("Radio preload: %s -> %d stations", cat_name, n)
                await asyncio.sleep(0.5)

        # Preload Music genre station lists
        music = next((i for i in top["items"] if i.get("name") == "Music"), None)
        if music and music.get("cid"):
            genres = await cache_browse(music["cid"])
            for genre in genres.get("items", []):
                if genre.get("container") == "yes" and genre.get("cid"):
                    result = await cache_browse(genre["cid"])
                    n = len([i for i in result.get("items", []) if i.get("playable") == "yes"])
                    total += n
                    await asyncio.sleep(0.3)

        unique = _count_unique_stations()
        if unique == 0:
            _schedule_retry("0 stations cached")
            return

        _preload_done = True
        _attempts = 0
        _cached_station_count = unique
        _LOGGER.info(
            "Radio preload: done - %d stations (%d unique) cached in %.1fs",
            total, unique, time.time() - t0,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        _LOGGER.warning("Radio preload error: %s", exc)
        _schedule_retry("error")
