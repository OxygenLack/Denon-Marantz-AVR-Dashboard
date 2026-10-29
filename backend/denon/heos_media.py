"""Map HEOS now-playing data to a dashboard source and a stream-quality label."""
from __future__ import annotations

import re
from typing import Any

# HEOS source ID → (telnet source code, display name)
# sid comes from now_playing.sid; source code maps to the button in the UI
HEOS_SID_MAP: dict[int, tuple[str, str]] = {
    4:    ("SPOTIFY",   "Spotify"),        # Spotify Connect
    3:    ("IRADIO",    "TuneIn"),         # TuneIn
    5:    ("NET",       "Deezer"),         # Deezer (no dedicated button)
    9:    ("NET",       "SoundCloud"),     # SoundCloud
    10:   ("NET",       "Tidal"),          # Tidal
    13:   ("NET",       "Amazon Music"),   # Amazon Music
    30:   ("NET",       "Qobuz"),          # Qobuz
    1024: ("SERVER",    "Local Music"),    # DLNA/UPnP server
    1025: ("NET",       "Playlists"),      # HEOS Playlists
    1026: ("NET",       "History"),        # HEOS History
    1028: ("FAVORITES", "Favorites"),      # HEOS Favorites
}

# Fallback: media ID (exact or prefix) → (telnet source code, display name)
HEOS_MID_PREFIXES: list[tuple[str, str, str]] = [
    ("spotify:",      "SPOTIFY",   "Spotify"),
    ("tidal:",        "NET",       "Tidal"),
    ("amazon_music:", "NET",       "Amazon Music"),
    ("deezer:",       "NET",       "Deezer"),
    ("pandora:",      "PANDORA",   "Pandora"),
    ("siriusxm:",     "SIRIUSXM",  "SiriusXM"),
    ("soundcloud:",   "NET",       "SoundCloud"),
    ("tunein:",       "IRADIO",    "TuneIn"),
    ("iheartradio:",  "IRADIO",    "iHeartRadio"),
    ("Bluetooth",     "BT",        "Bluetooth"),
]

_BITRATE_RE = re.compile(r"[_/-](\d{2,3})(?:k(?:bps)?)?(?:[/.]|$)", re.I)


def resolve_heos_service(now_playing: dict[str, Any] | None) -> tuple[str, str] | None:
    """Detect the active HEOS streaming service from now_playing data.

    Returns (source_code, display_name) or None. Checks mid (media ID) first:
    it is more specific than sid for shared IDs like sid=1024, which covers
    both Local Music and Bluetooth.
    """
    if not now_playing:
        return None
    mid = now_playing.get("mid", "")
    if mid:
        for prefix, code, name in HEOS_MID_PREFIXES:
            if mid.startswith(prefix):
                return (code, name)
    sid = now_playing.get("sid")
    if isinstance(sid, int) and sid in HEOS_SID_MAP:
        return HEOS_SID_MAP[sid]
    return None


def detect_stream_quality(now_playing: dict[str, Any] | None) -> str | None:
    """Best-effort codec/bitrate detection from the now_playing mid (stream URL)."""
    if not now_playing:
        return None
    mid = now_playing.get("mid", "")
    if not mid:
        return None
    if mid.startswith("spotify:"):
        return "Spotify Connect"
    if mid == "Bluetooth":
        return "Bluetooth"
    parts = []
    ml = mid.lower()
    if "/aacp" in ml or "/aac+" in ml or "he-aac" in ml:
        parts.append("AAC+")
    elif "/aac" in ml or ml.endswith(".aac"):
        parts.append("AAC")
    elif "/mp3" in ml or ml.endswith(".mp3"):
        parts.append("MP3")
    elif "/flac" in ml or ml.endswith(".flac"):
        parts.append("FLAC")
    elif "/ogg" in ml or "/vorbis" in ml:
        parts.append("OGG")
    elif "/wma" in ml:
        parts.append("WMA")
    elif ".m3u8" in ml or "/hls" in ml:
        parts.append("HLS")
    m = _BITRATE_RE.search(mid)
    if m:
        parts.append(f"{m.group(1)} kbps")
    return " ".join(parts) if parts else None
