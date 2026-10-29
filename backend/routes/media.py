"""HEOS media transport and now-playing endpoints. Radio lives in routes/radio.py."""
from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends

from dependencies import get_app_state
from routes._helpers import heos_action
from state import AppState

router = APIRouter(prefix="/api/v1/media", tags=["media"])

# (path, HeosClient method, label for the 502 detail)
_TRANSPORT = (
    ("play", "play", "Play"),
    ("pause", "pause", "Pause"),
    ("stop", "stop", "Stop"),
    ("next", "next_track", "Next"),
    ("previous", "previous_track", "Previous"),
)


def _transport_handler(method: str, label: str) -> Callable[..., Awaitable[dict]]:
    async def handler(state: AppState = Depends(get_app_state)) -> dict:
        return await heos_action(state, method, label)

    return handler


for _path, _method, _label in _TRANSPORT:
    router.add_api_route(
        f"/{_path}", _transport_handler(_method, _label),
        methods=["POST"], name=f"media_{_path}",
    )


@router.get("/now-playing")
async def media_now_playing(state: AppState = Depends(get_app_state)):
    """Return cached now-playing info (updated by background poller)."""
    return state.media_state
