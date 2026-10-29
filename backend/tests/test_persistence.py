"""JsonStore: atomic write, tolerant load."""
from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from persistence import JsonStore


def _dict_store(path):
    return JsonStore(path, dict, lambda d: d if isinstance(d, dict) else None, "test")


def test_missing_file_yields_default(tmp_path):
    assert _dict_store(tmp_path / "x.json").load() == {}


def test_save_is_atomic_and_round_trips(tmp_path):
    path = tmp_path / "sub" / "x.json"
    store = _dict_store(path)
    store.save({"b": 1, "a": 2})
    assert path.exists()
    assert not path.with_suffix(".json.tmp").exists()
    assert json.loads(path.read_text()) == {"a": 2, "b": 1}
    assert store.load() == {"a": 2, "b": 1}


def test_corrupt_file_yields_default(tmp_path, caplog):
    path = tmp_path / "x.json"
    path.write_text("{not json")
    with caplog.at_level("WARNING"):
        assert _dict_store(path).load() == {}
    assert any("Failed to load test" in r.message for r in caplog.records)


def test_wrong_type_yields_default(tmp_path):
    path = tmp_path / "x.json"
    path.write_text("[1, 2, 3]")
    assert _dict_store(path).load() == {}


def test_validate_exception_yields_default(tmp_path):
    path = tmp_path / "x.json"
    path.write_text('{"a": 1}')

    def boom(_raw):
        raise ValueError("nope")

    assert JsonStore(path, lambda: {"d": True}, boom).load() == {"d": True}


def test_save_failure_is_raised(tmp_path):
    path = tmp_path / "x.json"
    path.mkdir()  # a directory where the file should be
    with pytest.raises(OSError):
        _dict_store(path).save({"a": 1})
