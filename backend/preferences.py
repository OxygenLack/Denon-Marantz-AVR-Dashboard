"""File-based preferences storage for the Denon Dashboard."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

_LOGGER = logging.getLogger(__name__)

_PREFERENCES_FILE = Path(os.environ.get("DENON_DASHBOARD_DATA_DIR", "/data")) / "preferences.json"

_DEFAULTS: dict = {"theme": {"base": "gold", "overrides": {}}}


def load_preferences() -> dict:
    """Return saved preferences, or defaults if the file is missing or malformed."""
    try:
        data = json.loads(_PREFERENCES_FILE.read_text())
        # Merge with defaults so any missing keys are filled in
        merged = dict(_DEFAULTS)
        merged.update(data)
        return merged
    except FileNotFoundError:
        _LOGGER.debug("preferences.json not found at %s, using defaults", _PREFERENCES_FILE)
        return dict(_DEFAULTS)
    except Exception as exc:
        _LOGGER.warning("Failed to load preferences from %s: %s — using defaults", _PREFERENCES_FILE, exc)
        return dict(_DEFAULTS)


def save_preferences(data: dict) -> None:
    """Write preferences atomically. Logs a warning on failure (e.g. read-only filesystem)."""
    tmp = _PREFERENCES_FILE.with_suffix(".json.tmp")
    try:
        _PREFERENCES_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(data, indent=2))
        os.replace(tmp, _PREFERENCES_FILE)
        _LOGGER.debug("Preferences saved to %s", _PREFERENCES_FILE)
    except Exception as exc:
        _LOGGER.warning("Failed to save preferences to %s: %s", _PREFERENCES_FILE, exc)
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass
        raise
