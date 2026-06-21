from __future__ import annotations

from state import AppState, app_state

def get_app_state() -> AppState:
    """Dependency to provide the global application state."""
    return app_state
