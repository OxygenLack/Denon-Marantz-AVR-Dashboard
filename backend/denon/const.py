"""Constants for Denon AVR telnet protocol."""
import re

# Connection defaults
DEFAULT_TELNET_PORT = 23
DEFAULT_HTTP_PORT = 10443
DEFAULT_HEOS_PORT = 1255
HEOS_RECONNECT_LOG_EVERY = 20  # log every Nth consecutive HEOS connect failure
TELNET_TIMEOUT = 5.0
TELNET_RECONNECT_DELAY = 10  # initial delay; doubles up to TELNET_RECONNECT_MAX_DELAY
TELNET_RECONNECT_MAX_DELAY = 300  # cap at 5 min so an offline AVR doesn't spam logs every 10s
TELNET_SUPERVISOR_INTERVAL = 15  # how often the supervisor re-checks an established link
TELNET_RECONNECT_LOG_EVERY = 20  # log every Nth consecutive failure (AVRs are off for hours)
TELNET_HEARTBEAT_INTERVAL = 30
COMMAND_INTERVAL = 0.05  # 50ms between commands per protocol spec
# Extra gap between the status-poll queries on top of COMMAND_INTERVAL. A probe
# (2026-10-23) showed the AVR answers back-to-back queries too; the gap only
# keeps the initial poll from flooding the receiver right after a connect.
POLL_GAP = 0.08

# Strict allowlist for raw telnet commands (shared by telnet_client and WebSocket handler)
COMMAND_PATTERN = r"^[A-Z0-9 :?.+/\-]{1,50}$"
COMMAND_RE = re.compile(COMMAND_PATTERN)

# Source codes as used in SI<code> / Z2<code> and the source-name endpoints
SOURCE_CODE_PATTERN = r"^[A-Z0-9/]{1,10}$"

# Volume
VOLUME_MIN = 0
VOLUME_MAX = 98
VOLUME_0DB = 80

# Channel volume: 38–62, where 50 = 0dB
CV_MIN = 38
CV_MAX = 62
CV_0DB = 50

# Tone controls: 44–56, where 50 = 0dB
TONE_MIN = 44
TONE_MAX = 56
TONE_0DB = 50

# Subwoofer level: 38–62, where 50 = 0dB (or 00 = OFF)
SWL_MIN = 38
SWL_MAX = 62
SWL_0DB = 50

# Channel name mapping (protocol code -> human-readable)
CHANNEL_NAMES = {
    "FL": "Front Left",
    "FR": "Front Right",
    "C": "Center",
    "SW": "Subwoofer",
    "SW2": "Subwoofer 2",
    "SL": "Surround Left",
    "SR": "Surround Right",
    "SBL": "Surround Back Left",
    "SBR": "Surround Back Right",
    "SB": "Surround Back",
    "FHL": "Front Height Left",
    "FHR": "Front Height Right",
    "FWL": "Front Wide Left",
    "FWR": "Front Wide Right",
    "TFL": "Top Front Left",
    "TFR": "Top Front Right",
    "TML": "Top Middle Left",
    "TMR": "Top Middle Right",
    "TRL": "Top Rear Left",
    "TRR": "Top Rear Right",
    "RHL": "Rear Height Left",
    "RHR": "Rear Height Right",
    "FDL": "Front Dolby Left",
    "FDR": "Front Dolby Right",
    "SDL": "Surround Dolby Left",
    "SDR": "Surround Dolby Right",
    "BDL": "Back Dolby Left",
    "BDR": "Back Dolby Right",
    "SHL": "Surround Height Left",
    "SHR": "Surround Height Right",
    "TS": "Top Surround",
}

# Default source mapping (will be overridden by discovered sources)
DEFAULT_SOURCES = {
    "PHONO": "Phono",
    "CD": "CD",
    "TUNER": "Tuner",
    "DVD": "DVD",
    "BD": "Blu-ray",
    "TV": "TV Audio",
    "SAT/CBL": "SAT/Cable",
    "MPLAY": "Media Player",
    "GAME": "Game",
    "HDRADIO": "HD Radio",
    "NET": "Online Music",
    "PANDORA": "Pandora",
    "SIRIUSXM": "SiriusXM",
    "SPOTIFY": "Spotify",
    "LASTFM": "Last.fm",
    "FLICKR": "Flickr",
    "IRADIO": "Internet Radio",
    "SERVER": "Server",
    "FAVORITES": "Favorites",
    "AUX1": "AUX1",
    "AUX2": "AUX2",
    "AUX3": "AUX3",
    "AUX4": "AUX4",
    "AUX5": "AUX5",
    "AUX6": "AUX6",
    "AUX7": "AUX7",
    "BT": "Bluetooth",
    "USB/IPOD": "USB/iPod",
    "USB": "USB",
    "IPD": "iPod Direct",
    "IRP": "Internet Radio Recent",
    "FVP": "Favorites Play",
}

# HEOS / network sources that SSFUN ? does not report.
# Included automatically unless disabled via DENON_DASHBOARD_HEOS_SOURCES=false.
HEOS_SOURCES = {
    "NET": "Online Music",
    "BT": "Bluetooth",
    "IRADIO": "Internet Radio",
    "SPOTIFY": "Spotify",
    "PANDORA": "Pandora",
    "SIRIUSXM": "SiriusXM",
    "FAVORITES": "Favorites",
    "SERVER": "Server",
}

# Sources that require a matching HEOS music service to be available.
# If the service isn't found via browse/get_music_sources, hide the source button.
# Maps source code → HEOS service names that indicate availability.
HEOS_REGION_SOURCES = {
    "PANDORA": {"Pandora"},
    "SIRIUSXM": {"SiriusXM"},
}

# Surround mode categories (from OPSMLALL protocol data)
SURROUND_CATEGORIES = {
    "MOV": "Movie",
    "MUS": "Music",
    "GAM": "Game",
    "PUR": "Pure/Direct",
}

# Category cycling commands (sent when clicking a category tab), shipped to
# the frontend via /device.surround_categories
SURROUND_CATEGORY_COMMANDS = {
    "MOV": "MOVIE",
    "MUS": "MUSIC",
    "GAM": "GAME",
    "PUR": "DIRECT",
}

# Display name → telnet command mapping for known modes.
# Dynamically learned mappings from OPSMLALL override these.
KNOWN_MODE_COMMANDS = {
    "Stereo": "STEREO",
    "Direct": "DIRECT",
    "Pure Direct": "PURE DIRECT",
    "Multi Ch Stereo": "MCH STEREO",
    "Mono Movie": "MONO MOVIE",
    "Rock Arena": "ROCK ARENA",
    "Jazz Club": "JAZZ CLUB",
    "Matrix": "MATRIX",
    "Video Game": "VIDEO GAME",
    "Virtual": "VIRTUAL",
    "Dolby Audio - Dolby Surround": "DOLBY AUDIO-DSUR",
    "Dolby Surround": "DOLBY SURROUND",
    "Dolby Digital": "DOLBY DIGITAL",
    "Dolby Atmos": "DOLBY ATMOS",
    "DTS Neural:X": "NEURAL:X",
    "DTS Virtual:X": "VIRTUAL:X",
    "DTS Surround": "DTS SURROUND",
    "DTS:X": "DTS:X",
    "Multi Ch In": "MULTI CH IN",
    "Multi Ch In 7.1": "MULTI CH IN 7.1",
}

# Receiver-side media inputs (not HEOS services) that the HEOS transport
# controls also drive. /device.media_sources = HEOS_SOURCES + these.
MEDIA_INPUT_SOURCES = ("MPLAY", "USB", "USB/IPOD")

# Fallback surround modes for receivers that don't send OPSMLALL
SURROUND_MODES = [
    "DIRECT", "PURE DIRECT", "STEREO",
    "DOLBY DIGITAL", "DOLBY SURROUND", "DOLBY ATMOS",
    "DTS SURROUND", "DTS:X", "MULTI CH IN", "MULTI CH IN 7.1",
    "MCH STEREO", "ROCK ARENA", "JAZZ CLUB", "MONO MOVIE",
    "MATRIX", "VIDEO GAME", "VIRTUAL",
]

# Query commands for full status poll
QUERY_COMMANDS = [
    "PW?", "ZM?", "MV?", "MU?", "SI?", "MS?", "SD?", "CV?",
    "SSFUN ?",
    "SSSOD ?",
    "NSFRN ?",
    "PSTONE CTRL ?", "PSBAS ?", "PSTRE ?",
    "PSSWL ?", "PSDIL ?",
    "PSMULTEQ: ?", "PSDYNEQ ?", "PSDYNVOL ?",
    "PSREFLEV ?",
    "Z2?", "Z2MU?", "Z2SLP?",
    "SLP?", "ECO?",
]
