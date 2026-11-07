"""Settings parsing: bad env values must degrade, never stop the container."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", {}),
        ("   ", {}),
        ("[]", {}),
        ("{broken", {}),
        ('"GAME"', {}),
        ('{"GAME": "PS5", "BD": ""}', {"GAME": "PS5"}),
    ],
)
def test_source_names_never_fail(monkeypatch, raw, expected):
    monkeypatch.setenv("DENON_DASHBOARD_DENON_SOURCE_NAMES", raw)
    assert Settings(_env_file=None).denon_source_names == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("24H", "24h"), (" 12h ", "12h"), ("auto", "auto"), ("", "auto"), ("weird", "auto")],
)
def test_time_format_falls_back_to_auto(monkeypatch, raw, expected):
    monkeypatch.setenv("DENON_DASHBOARD_TIME_FORMAT", raw)
    assert Settings(_env_file=None).time_format == expected
