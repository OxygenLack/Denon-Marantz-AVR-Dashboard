// Shared types, lookup tables and pure helpers for the radio browser.

export interface RadioItem {
  cid?: string
  mid?: string
  name: string
  container?: string
  playable?: string
  image_url?: string | null
  station?: string | null
}

export interface NavEntry {
  title: string
  cid: string | null | undefined
}

export type RadioReason = 'ok' | 'no_heos' | 'signed_out' | 'tunein_unavailable'

// Mirrors backend RadioStatusResponse (GET /api/v1/media/radio/status).
export interface RadioStatus {
  ready: boolean
  reason: string  // a RadioReason; unknown values render the generic guide
  heos_connected: boolean
  account_signed_in: boolean
  username?: string | null
  tunein_available: boolean
  cached_stations: number
  preloading?: boolean
}

export const FAVORITES_CID = '__favorites__'

// Hide broken categories (TuneIn API issues)
export const HIDDEN_CATEGORIES = new Set(['By Language'])

export const CATEGORY_ICONS: Record<string, string> = {
  'Local Radio': '📍',
  'Trending': '🔥',
  'Music': '🎵',
  'Talk': '💬',
  'Sports': '⚽',
  'News & Talk': '📰',
  'News %26 Talk': '📰',
  'By Location': '🌍',
  'By Language': '🗣️',
  'Podcasts': '🎙️',
}

/* Flag emoji for countries and languages */
export const FLAGS: Record<string, string> = {
  // Countries (By Location)
  'Afghanistan': '🇦🇫', 'Albania': '🇦🇱', 'Algeria': '🇩🇿', 'American Samoa': '🇦🇸',
  'Andorra': '🇦🇩', 'Argentina': '🇦🇷', 'Armenia': '🇦🇲', 'Australia': '🇦🇺',
  'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿', 'Bahrain': '🇧🇭', 'Bangladesh': '🇧🇩',
  'Belarus': '🇧🇾', 'Belgium': '🇧🇪', 'Belize': '🇧🇿', 'Benin': '🇧🇯',
  'Bermuda': '🇧🇲', 'Bolivia': '🇧🇴', 'Bosnia and Herzegovina': '🇧🇦',
  'Botswana': '🇧🇼', 'Brazil': '🇧🇷', 'Brunei Darussalam': '🇧🇳', 'Bulgaria': '🇧🇬',
  'Burkina Faso': '🇧🇫', 'Burundi': '🇧🇮', 'Cambodia': '🇰🇭', 'Cameroon': '🇨🇲',
  'Canada': '🇨🇦', 'Caribbean Islands': '🏝️', 'Central African Republic': '🇨🇫',
  'Chad': '🇹🇩', 'Chile': '🇨🇱', 'China': '🇨🇳', 'Christmas Island': '🇨🇽',
  'Cocos Islands': '🇨🇨', 'Colombia': '🇨🇴', 'Congo': '🇨🇬', 'Cook Islands': '🇨🇰',
  'Costa Rica': '🇨🇷', "Cote D'ivoire": '🇨🇮', 'Croatia': '🇭🇷', 'Cyprus': '🇨🇾',
  'Czech Republic': '🇨🇿', 'DR Congo': '🇨🇩', 'Denmark': '🇩🇰', 'East Timor': '🇹🇱',
  'Ecuador': '🇪🇨', 'Egypt': '🇪🇬', 'El Salvador': '🇸🇻', 'Equatorial Guinea': '🇬🇶',
  'Eritrea': '🇪🇷', 'Estonia': '🇪🇪', 'Ethiopia': '🇪🇹', 'Falkland Islands': '🇫🇰',
  'Fiji': '🇫🇯', 'Finland': '🇫🇮', 'France': '🇫🇷', 'French Guiana': '🇬🇫',
  'French Polynesia': '🇵🇫', 'Gabon': '🇬🇦', 'Gambia': '🇬🇲', 'Georgia': '🇬🇪',
  'Germany': '🇩🇪', 'Ghana': '🇬🇭', 'Greece': '🇬🇷', 'Greenland': '🇬🇱',
  'Guam': '🇬🇺', 'Guatemala': '🇬🇹', 'Guinea': '🇬🇳', 'Guinea-Bissau': '🇬🇼',
  'Guyana': '🇬🇾', 'Honduras': '🇭🇳', 'Hong Kong': '🇭🇰', 'Hungary': '🇭🇺',
  'Iceland': '🇮🇸', 'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iraq': '🇮🇶',
  'Ireland': '🇮🇪', 'Israel': '🇮🇱', 'Italy': '🇮🇹', 'Japan': '🇯🇵',
  'Jordan': '🇯🇴', 'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪', 'Kosovo': '🇽🇰',
  'Kuwait': '🇰🇼', 'Latvia': '🇱🇻', 'Lebanon': '🇱🇧', 'Libya': '🇱🇾',
  'Liechtenstein': '🇱🇮', 'Lithuania': '🇱🇹', 'Luxembourg': '🇱🇺', 'Macedonia': '🇲🇰',
  'Madagascar': '🇲🇬', 'Malawi': '🇲🇼', 'Malaysia': '🇲🇾', 'Mali': '🇲🇱',
  'Malta': '🇲🇹', 'Mauritius': '🇲🇺', 'Mayotte': '🇾🇹', 'Mexico': '🇲🇽',
  'Moldova': '🇲🇩', 'Monaco': '🇲🇨', 'Mongolia': '🇲🇳', 'Montenegro': '🇲🇪',
  'Morocco': '🇲🇦', 'Mozambique': '🇲🇿', 'Myanmar (Burma)': '🇲🇲', 'Namibia': '🇳🇦',
  'Nepal': '🇳🇵', 'Netherlands': '🇳🇱', 'New Caledonia': '🇳🇨', 'New Zealand': '🇳🇿',
  'Nicaragua': '🇳🇮', 'Niger': '🇳🇪', 'Nigeria': '🇳🇬', 'Norfolk Island': '🇳🇫',
  'Northern Mariana Islands': '🇲🇵', 'Norway': '🇳🇴', 'Oman': '🇴🇲', 'Pakistan': '🇵🇰',
  'Palestine': '🇵🇸', 'Panama': '🇵🇦', 'Papua New Guinea': '🇵🇬', 'Paraguay': '🇵🇾',
  'Peru': '🇵🇪', 'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹',
  'Qatar': '🇶🇦', 'Reunion': '🇷🇪', 'Romania': '🇷🇴', 'Russia': '🇷🇺',
  'Rwanda': '🇷🇼', 'San Marino': '🇸🇲', 'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳',
  'Serbia': '🇷🇸', 'Sierra Leone': '🇸🇱', 'Singapore': '🇸🇬', 'Slovakia': '🇸🇰',
  'Slovenia': '🇸🇮', 'Solomon Islands': '🇸🇧', 'South Africa': '🇿🇦',
  'South Korea': '🇰🇷', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰', 'St. Helena': '🇸🇭',
  'St. Pierre-Miquelon': '🇵🇲', 'Sudan': '🇸🇩', 'Suriname': '🇸🇷',
  'Swaziland': '🇸🇿', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Syria': '🇸🇾',
  'Taiwan': '🇹🇼', 'Tajikistan': '🇹🇯', 'Tanzania': '🇹🇿', 'Thailand': '🇹🇭',
  'Togo': '🇹🇬', 'Tonga': '🇹🇴', 'Tunisia': '🇹🇳', 'Turkey': '🇹🇷',
  'Uganda': '🇺🇬', 'Ukraine': '🇺🇦', 'United Arab Emirates': '🇦🇪',
  'United Kingdom': '🇬🇧', 'United States': '🇺🇸', 'Uruguay': '🇺🇾',
  'Uzbekistan': '🇺🇿', 'Vanuatu': '🇻🇺', 'Vatican City': '🇻🇦',
  'Venezuela': '🇻🇪', 'Wallis-Futuna Islands': '🇼🇫', 'Yemen': '🇾🇪',
  'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼',
  // Regions
  'Africa': '🌍', 'Asia': '🌏', 'Australasia': '🌏', 'Central America': '🌎',
  'Europe': '🇪🇺', 'North America': '🌎', 'South America': '🌎',
  // Music genres
  'Country': '🤠', 'Apple Music': '🍎', 'Powerhitz': '⚡', 'World Music': '🌍',
  'Top 40 %26 Pop Music': '🎤', 'Top 40 & Pop Music': '🎤',
  'Soul %26 R%26B': '🎷', 'Soul & R&B': '🎷',
  'Rock Music': '🎸', 'Religious Music': '⛪', 'Reggae %26 Dancehall': '🌴',
  'Reggae & Dancehall': '🌴', 'Latin Music': '💃', 'Jazz': '🎹',
  'Indie Music': '🎵', 'Holiday Music': '🎄', 'Hip Hop': '🎤',
  'Folk': '🪕', 'Easy Listening': '☕', 'Decades Music': '📀',
  'Dance %26 Electronic': '🎧', 'Dance & Electronic': '🎧',
  'College Radio': '🎓', 'Classical Music': '🎻',
  "Children's Music": '👶', 'Blues': '🎵', 'Adult Hits': '📻',
  'Classic Hits': '💿', 'Boss Radio': '👔', 'Variety': '🎭', 'Schlager': '🎶',
  // Sports
  'Tennis': '🎾', 'Soccer': '⚽', 'Formula 1': '🏎️', 'Fantasy Sports': '🏆',
  'College Football': '🏈', 'World Cup': '🏆',
  "Men's College Basketball": '🏀', 'College Football Bowl Central': '🏈',
  'Sports Talk %26 News': '📰', 'Sports Talk & News': '📰',
  'Copa America 100': '⚽', 'More Sports and Teams': '🏅',
  'Deportes': '⚽', 'De Deportes': '⚽',
  // Talk
  "This Week's Top 25 Podcasts": '🏆', 'Most Popular News Stations': '📰',
  'Talk Show Replays': '🔄', 'The Best of CBC': '🇨🇦',
  'Top Public Radio Picks': '📻', 'Catholic Talk': '⛪',
  "Editors' Choice - Talk": '⭐', 'Best of British': '🇬🇧',
  'Mindfulness': '🧘', 'De Noticias': '📰', 'De Música': '🎵',
  'Top Sports Talk Shows': '🎙️', 'Top Sports Podcasts': '🎙️',
  // Podcasts (reuse music genre icons)
}


/** Only http(s) URLs survive: no javascript:/data: URIs in <img src>. */
export function safeImageUrl(url: unknown, base: string = window.location.origin): string | null {
  if (!url || typeof url !== 'string') return null
  try {
    // Relative paths (e.g. the bundled demo cover) resolve against `base`.
    const parsed = new URL(url, base)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null
  } catch { return null }
}

/** TuneIn names arrive percent-encoded ("News %26 Talk"); decode defensively. */
export function decodeLabel(name: string | null | undefined): string {
  if (!name) return ''
  try {
    return decodeURIComponent(name.replace(/%26/g, '&').replace(/%25/g, '%'))
  } catch {
    return name.replace(/%26/g, '&')
  }
}
