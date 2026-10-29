"""Parsing of the HEOS CLI `message` field."""
from __future__ import annotations


def parse_heos_message(message: str | None) -> dict[str, str]:
    """Parse a HEOS `message` field (`pid=-12345&state=play`) into a dict.

    Flags without a value (`signed_in&un=x` → `signed_in`) are skipped; callers
    that care about them test the raw string. Later keys win on duplicates.
    """
    parsed: dict[str, str] = {}
    if not message:
        return parsed
    for part in message.split("&"):
        key, sep, value = part.partition("=")
        if sep:
            parsed[key] = value
    return parsed
