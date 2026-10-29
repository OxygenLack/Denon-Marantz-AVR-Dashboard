"""Small JSON file store for the data volume (source names, UI settings, …).

Atomic writes (tmp + replace) and a tolerant load: a missing, corrupt or
wrong-typed file yields the default instead of an exception, so a bad file on
the volume can never keep the backend from starting.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

_LOGGER = logging.getLogger(__name__)

class JsonStore[T]:
    def __init__(
        self,
        path: Path,
        default: Callable[[], T],
        validate: Callable[[Any], T | None] | None = None,
        label: str | None = None,
    ) -> None:
        """`default()` builds a fresh default; `validate(raw)` returns the typed
        value or None to reject the file content (falls back to the default)."""
        self.path = path
        self._default = default
        self._validate = validate
        self.label = label or path.name

    def load(self) -> T:
        try:
            if not self.path.exists():
                return self._default()
            raw = json.loads(self.path.read_text())
        except Exception as exc:
            _LOGGER.warning("Failed to load %s: %s", self.label, exc)
            return self._default()
        if self._validate is None:
            return raw
        try:
            value = self._validate(raw)
        except Exception as exc:
            _LOGGER.warning("Rejected %s content: %s", self.label, exc)
            return self._default()
        if value is None:
            _LOGGER.warning("Rejected %s content: wrong type", self.label)
            return self._default()
        return value

    def save(self, data: T) -> None:
        """Write atomically. Logs and re-raises on failure (the caller decides)."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(self.path.suffix + ".tmp")
            tmp.write_text(json.dumps(data, indent=2, sort_keys=True))
            tmp.replace(self.path)
        except Exception as exc:
            _LOGGER.error("Failed to save %s: %s", self.label, exc)
            raise
