"""Audyssey speaker calibration fetching."""
from __future__ import annotations

import ipaddress
import logging

import defusedxml.ElementTree as ET
import httpx

from denon.const import DEFAULT_HTTP_PORT

_MAX_RESPONSE_BYTES = 512 * 1024  # 512 KB

_LOGGER = logging.getLogger(__name__)

# HTTP speaker index to telnet channel code
SPEAKER_INDEX_MAP = {
    "0": "FL", "1": "FR", "2": "C", "3": "SW",
    "4": "SR", "5": "SBR", "6": "SB", "7": "SBL",
    "8": "SL", "9": "FHR", "10": "FHL", "11": "FWR",
    "12": "FWL", "13": "TFR", "14": "TFL", "15": "TMR",
    "16": "TML", "17": "TRR", "18": "TRL",
    "30": "SW", "31": "SW2",
}


def is_private_host(host: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    """Return the parsed address when ``host`` is a private LAN IP, else None.

    Loopback and link-local addresses are rejected too. Shared by the
    calibration fetch (SSRF guard) and ``POST /connect``.
    """
    try:
        addr = ipaddress.ip_address(host.strip())
    except (ValueError, AttributeError):
        return None
    if not addr.is_private or addr.is_loopback or addr.is_link_local:
        return None
    return addr


async def fetch_speaker_calibration(host: str) -> dict[str, float]:
    """Fetch Audyssey speaker calibration from receiver HTTP API (best-effort).

    Note: SSL verification is intentionally disabled because Denon receivers
    use self-signed certificates on their HTTPS management interface.
    """
    if not host or host == "0.0.0.0":
        return {}
    # Validate host is a private IP to prevent SSRF
    addr = is_private_host(host)
    if addr is None:
        _LOGGER.warning("Calibration fetch blocked for non-private or invalid host: %s", host)
        return {}
    try:
        # Use str(addr) instead of host to break CodeQL taint tracking —
        # addr is a validated ipaddress.ip_address object at this point.
        safe_host = str(addr)
        url = f"https://{safe_host}:{DEFAULT_HTTP_PORT}/ajax/speakers/get_config?type=5"
        # Intentionally disable SSL verification — receiver uses self-signed certs
        async with httpx.AsyncClient(verify=False) as client:
            async with client.stream(
                "GET", url, headers={"User-Agent": "DenonDashboard/1.0"}, timeout=5.0
            ) as resp:
                resp.raise_for_status()
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) >= _MAX_RESPONSE_BYTES:
                        break  # stop reading; never buffer an unbounded reply
        root = ET.fromstring(bytes(body[:_MAX_RESPONSE_BYTES]))
        cal: dict[str, float] = {}
        for sp in root.findall(".//Speaker"):
            idx = sp.get("index", "")
            ch = SPEAKER_INDEX_MAP.get(idx)
            if ch and sp.text:
                cal[ch] = int(sp.text) / 10.0
        _LOGGER.info("Fetched speaker calibration: %s", cal)
        return cal
    except Exception as exc:
        _LOGGER.warning("Could not fetch speaker calibration (HTTP): %s", exc)
        return {}
