"""Constants for Denon AVR telnet protocol."""

# Connection defaults
DEFAULT_TELNET_PORT = 23
DEFAULT_HTTP_PORT = 10443
TELNET_TIMEOUT = 5.0
TELNET_RECONNECT_DELAY = 10
TELNET_MAX_RECONNECT = 0  # unlimited
TELNET_HEARTBEAT_INTERVAL = 30
TELNET_FEEDBACK_POLL_INTERVAL = 2.0
COMMAND_INTERVAL = 0.05  # 50ms between commands per protocol spec

# Strict allowlist for raw telnet commands (shared by telnet_client and WebSocket handler)
COMMAND_PATTERN = r"^[A-Z0-9 :?.+/\-]{1,50}$"

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

# Category cycling commands (sent when clicking a category tab)
CATEGORY_COMMANDS = {
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
    "Z2?", "Z2MU?",
    "SLP?", "ECO?",
]
