"""Internet radio (TuneIn) endpoints. Cache + preload live in radio_service.py."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

import radio_service
from api.models import RadioFavoriteRequest, RadioPlayRequest, RadioStatusResponse
from dependencies import get_app_state
from state import AppState

router = APIRouter(prefix="/api/v1/media/radio", tags=["radio"])


@router.get("/favorites")
async def radio_favorites(state: AppState = Depends(get_app_state)):
    return {"favorites": state.radio_favorites}


@router.post("/favorites")
async def add_radio_favorite(req: RadioFavoriteRequest, state: AppState = Depends(get_app_state)):
    favorite = req.model_dump()
    state.upsert_radio_favorite(favorite)
    return {"ok": True, "favorite": favorite, "favorites": state.radio_favorites}


@router.delete("/favorites/{mid:path}")
async def delete_radio_favorite(mid: str, state: AppState = Depends(get_app_state)):
    state.remove_radio_favorite(mid)
    return {"ok": True, "favorites": state.radio_favorites}


@router.get("/status", response_model=RadioStatusResponse)
async def radio_status(state: AppState = Depends(get_app_state)):
    """Diagnose whether internet radio (TuneIn) is usable.

    Drives the WebUI guidance panel. ``reason`` is one of:
      - ``ok``                 — TuneIn ready (or stations already cached)
      - ``no_heos``            — receiver's HEOS service unreachable
      - ``signed_out``         — no HEOS account signed in on the receiver
      - ``tunein_unavailable`` — signed in, but TuneIn not available yet

    ``preloading`` is True while the station preload task is running.
    """
    cached = radio_service.cached_station_count()
    preloading = radio_service.is_preloading()
    if not state.heos:
        return RadioStatusResponse(
            ready=False, reason="no_heos", heos_connected=False,
            account_signed_in=False, username=None,
            tunein_available=False, cached_stations=cached, preloading=preloading,
        )

    acct = await state.heos.check_account()
    signed_in = bool(acct.get("signed_in"))
    reachable = bool(acct.get("reachable"))
    tunein = await state.heos.is_source_available(radio_service.TUNEIN_SID)

    # A populated cache means the UI works regardless of a transient probe.
    if cached > 0:
        reason = "ok"
    elif not reachable:
        reason = "no_heos"
    elif not signed_in:
        reason = "signed_out"
    elif tunein is False:
        reason = "tunein_unavailable"
    elif tunein is None:
        reason = "no_heos"
    else:
        reason = "ok"

    return RadioStatusResponse(
        ready=reason == "ok",
        reason=reason,
        heos_connected=state.heos.connected,
        account_signed_in=signed_in,
        username=acct.get("username"),
        tunein_available=bool(tunein),
        cached_stations=cached,
        preloading=preloading,
    )


@router.get("/browse")
async def radio_browse(
    cid: str | None = Query(None, max_length=1000, pattern=r"^[^\r\n]*$"),
    state: AppState = Depends(get_app_state),
):
    """Browse TuneIn radio directory. Omit cid for top-level categories."""
    # The route answers 503 itself; radio_service.cache_browse keeps its own
    # HEOS guard for the preload path, which has no request to fail.
    if not state.heos:
        raise HTTPException(503, "HEOS not connected")
    return await radio_service.cache_browse(cid)


@router.get("/search")
async def radio_search(q: str = ""):
    """Search across all cached radio stations (filled by the preload)."""
    query = q.strip().lower()
    if len(query) < 2:
        return {"results": [], "cached_stations": radio_service.cached_station_count()}
    results = radio_service.search_stations(query)
    return {"results": results, "cached_stations": radio_service.cached_station_count()}


@router.post("/refresh")
async def radio_refresh():
    """Clear the radio cache and re-run the station preload (single-flight)."""
    radio_service.reset()
    started = radio_service.ensure_radio_preload()
    return {"ok": True, "started": started, "preloading": radio_service.is_preloading()}


@router.post("/play")
async def radio_play(req: RadioPlayRequest, state: AppState = Depends(get_app_state)):
    """Play a TuneIn radio station by media ID."""
    if not state.heos:
        raise HTTPException(503, "HEOS not connected")
    # Play uses the main HEOS connection (same player session)
    ok = await state.heos.play_stream(radio_service.TUNEIN_SID, req.mid)
    if not ok:
        raise HTTPException(502, "Failed to play station")
    return {"ok": True}
