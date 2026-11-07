"""Security headers: framing is denied unless FRAME_ANCESTORS lists origins."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _frame_policy, _parse_origins


def test_default_denies_framing():
    csp, extra = _frame_policy("")
    assert b"frame-ancestors 'none'" in csp
    assert (b"x-frame-options", b"DENY") in extra


def test_listed_origins_may_frame_and_xfo_is_dropped():
    csp, extra = _frame_policy("https://hassio.example.com, http://ha.local:8123")
    assert csp.endswith(b"frame-ancestors 'self' https://hassio.example.com http://ha.local:8123")
    assert extra == []
    # the rest of the policy is untouched
    assert csp.startswith(b"default-src 'self'; img-src 'self' http: https:;")


def test_wildcard_and_garbage_fall_back_to_deny():
    csp, extra = _frame_policy("*, not-a-url, ftp://x")
    assert b"frame-ancestors 'none'" in csp
    assert (b"x-frame-options", b"DENY") in extra


def test_parse_origins_normalises_to_scheme_and_host():
    assert _parse_origins("https://a.example/path?x=1, http://b:8080/", "T") == [
        "https://a.example",
        "http://b:8080",
    ]


def test_live_response_carries_default_headers():
    from fastapi.testclient import TestClient

    from main import app

    # Any response goes through the middleware, a 404 avoids receiver state.
    r = TestClient(app).get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.headers["content-security-policy"].endswith("frame-ancestors 'none'")
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-content-type-options"] == "nosniff"
