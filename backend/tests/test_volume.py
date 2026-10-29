"""Tests for volume parsing helper."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from denon.telnet_client import DenonTelnetClient


def test_parse_volume_integer():
    """'50' → 50.0."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("50") == 50.0


def test_parse_volume_half_step():
    """'505' → 50.5 (three digits ending in 5 means half-step)."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("505") == 50.5


def test_parse_volume_high():
    """'80' → 80.0 (0 dB)."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("80") == 80.0


def test_parse_volume_high_half():
    """'805' → 80.5."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("805") == 80.5


def test_parse_volume_zero():
    """'00' → 0.0."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("00") == 0.0


def test_parse_volume_empty():
    """'' → None."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("") is None


def test_parse_volume_whitespace():
    """' 50 ' → 50.0 (trimmed)."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume(" 50 ") == 50.0


def test_parse_volume_invalid():
    """'ABC' → None."""
    client = DenonTelnetClient("127.0.0.1")
    assert client._parse_volume("ABC") is None
