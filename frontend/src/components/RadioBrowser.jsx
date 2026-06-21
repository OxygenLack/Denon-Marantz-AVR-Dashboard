import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'

const CATEGORY_ICONS = {
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
const FLAGS = {
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

function safeImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null
  } catch { return null }
}

export default function RadioBrowser({ open, onClose, favorites = [], onFavoriteChange }) {
  const [navStack, setNavStack] = useState([]) // [{title, cid}]
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [playingMid, setPlayingMid] = useState(null)
  const [closing, setClosing] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const contentRef = useRef(null)
  const fetchIdRef = useRef(0)
  const cacheRef = useRef(new Map()) // cid → items[]
  const searchInputRef = useRef(null)

  const currentTitle = navStack.length > 0 ? navStack[navStack.length - 1].title : 'Internet Radio'
  const currentCid = navStack.length > 0 ? navStack[navStack.length - 1].cid : null
  const cacheKey = currentCid ?? '__root__'

  // Reset nav stack when modal opens — use a ref to track open transitions
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setNavStack([])
      setPlayingMid(null)
      setClosing(false)
      setRetryCount(0)
      setSearchQuery('')
      // Keep cache across opens — categories don't change
    }
    prevOpenRef.current = open
  }, [open])

  // Fetch items — use cache on hit, fetch on miss
  useEffect(() => {
    if (!open) return

    // Cache hit — use immediately, no loading state
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setItems(cached)
      setLoading(false)
      setError(null)
      return
    }

    const id = ++fetchIdRef.current
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setItems([])

    if (currentCid === '__favorites__') {
      setItems(favorites.map(f => ({ ...f, playable: 'yes' })))
      setLoading(false)
      setError(null)
      return
    }

    const url = currentCid
      ? `/api/v1/media/radio/browse?cid=${encodeURIComponent(currentCid)}`
      : '/api/v1/media/radio/browse'

    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch(url, { signal: controller.signal })
      .then(resp => {
        clearTimeout(timeout)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.json()
      })
      .then(data => {
        if (fetchIdRef.current !== id) return
        const fetched = data.items || []
        const withFavorites = cacheKey === '__root__' && favorites.length > 0
          ? [{ name: 'Favorites', container: 'yes', cid: '__favorites__' }, ...fetched]
          : fetched
        cacheRef.current.set(cacheKey, withFavorites)
        setItems(withFavorites)
        setLoading(false)
      })
      .catch(err => {
        clearTimeout(timeout)
        if (fetchIdRef.current !== id) return
        if (err.name === 'AbortError') {
          setError('Request timed out')
        } else {
          setError('Failed to load stations')
        }
        setItems([])
        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [open, cacheKey, retryCount, favorites])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Scroll to top on navigation
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [navStack.length])

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 150)
  }

  const isFavorite = (item) => Boolean(item?.mid && favorites.some(f => f.mid === item.mid))

  const toggleFavorite = async (item) => {
    if (!item?.mid) return
    if (isFavorite(item)) {
      await onFavoriteChange?.(item, false)
    } else {
      await onFavoriteChange?.({
        mid: item.mid,
        name: decodeLabel(item.name) || item.station || item.mid,
        image_url: item.image_url || null,
        station: item.station || null,
      }, true)
    }
  }

  const handleItemClick = async (item) => {
    if (item.container === 'yes') {
      // Navigate into container
      setNavStack(prev => [...prev, { title: decodeLabel(item.name), cid: item.cid }])
    } else if (item.playable === 'yes' && item.mid) {
      // Play station
      setPlayingMid(item.mid)
      try {
        const resp = await fetch('/api/v1/media/radio/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mid: item.mid }),
        })
        if (!resp.ok) throw new Error()
        setTimeout(handleClose, 600)
      } catch {
        setPlayingMid(null)
        setError('Could not play station')
        setTimeout(() => setError(null), 3000)
      }
    }
  }

  const handleBack = () => {
    setNavStack(prev => prev.slice(0, -1))
    setSearchQuery('')
  }

  // Search via backend (searches all preloaded + cached stations)
  const [searchResults, setSearchResults] = useState(null)
  const [searchInfo, setSearchInfo] = useState('')
  const [cachedCount, setCachedCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshTargetRef = useRef(0)
  const searchAbortRef = useRef(null)

  // Poll cached station count while modal is open
  useEffect(() => {
    if (!open) return
    let active = true
    const poll = async () => {
      try {
        const r = await fetch('/api/v1/media/radio/search?q=__')
        const d = await r.json()
        if (active) setCachedCount(d.cached_stations || 0)
      } catch {}
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [open])

  // Detect refresh completion: count climbed back past the pre-refresh level
  useEffect(() => {
    if (refreshing && cachedCount >= refreshTargetRef.current && cachedCount > 0) {
      setRefreshing(false)
    }
  }, [cachedCount, refreshing])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearchInfo('')
      return
    }
    if (searchAbortRef.current) searchAbortRef.current.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    const timer = setTimeout(() => {
      fetch(`/api/v1/media/radio/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          if (!controller.signal.aborted) {
            setSearchResults(data.results || [])
            setSearchInfo(`${data.results?.length || 0} of ${data.cached_stations || 0} stations`)
          }
        })
        .catch(() => {})
    }, 150) // debounce

    return () => { clearTimeout(timer); controller.abort() }
  }, [searchQuery, cachedCount]) // re-search when cache updates

  if (!open) return null

  const isSearching = searchResults !== null
  const isTopLevel = navStack.length === 0 && !isSearching
  // Hide broken categories (TuneIn API issues)
  const HIDDEN_CATEGORIES = new Set(['By Language'])
  const filteredItems = isTopLevel
    ? items.filter(i => !HIDDEN_CATEGORIES.has(i.name) && !HIDDEN_CATEGORIES.has(decodeLabel(i.name)))
    : items
  const displayItems = isSearching ? searchResults : filteredItems
  const animClass = closing
    ? 'opacity-0 translate-y-4'
    : 'opacity-100 translate-y-0'
  const backdropClass = closing ? 'opacity-0' : 'opacity-100'

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 z-50 transition-opacity duration-200 ${backdropClass}`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div data-modal="radio" className={`fixed inset-2 sm:inset-auto sm:top-4 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl
        bg-denon-dark rounded-2xl z-50 flex flex-col overflow-hidden
        border border-denon-accent/40 shadow-2xl shadow-black/50
        transition-all duration-200 ease-out ${animClass}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-denon-border/30 shrink-0">
          <div className="flex items-center gap-2">
            {!isTopLevel && (
              <button
                onClick={handleBack}
                className="text-denon-muted hover:text-denon-text transition-colors p-1"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            <h2 className="text-sm font-medium text-denon-text truncate">{currentTitle}</h2>
            <span className="text-sm text-denon-muted bg-denon-surface px-2.5 py-1 rounded-full font-medium">
              📻 {cachedCount > 0 ? cachedCount : '...'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                if (refreshing) return
                refreshTargetRef.current = Math.max(cachedCount, 100)
                setRefreshing(true)
                setCachedCount(0)
                cacheRef.current.clear()
                try {
                  await fetch('/api/v1/media/radio/refresh', { method: 'POST' })
                  setRetryCount(c => c + 1)
                } catch { setRefreshing(false) }
              }}
              disabled={refreshing}
              className={`p-1.5 transition-all ${
                refreshing
                  ? 'text-denon-gold/40 cursor-wait'
                  : 'text-denon-muted hover:text-denon-text'
              }`}
              title={refreshing ? 'Refreshing...' : 'Refresh station list'}
            >
              <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
            <button
              onClick={handleClose}
              className="text-denon-muted hover:text-denon-text transition-colors p-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 sm:px-4 pt-3 shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-denon-muted pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stations..."
              className="w-full bg-denon-surface/70 text-denon-text text-sm rounded-xl pl-10 pr-8 py-2.5
                border border-denon-border/30 focus:border-denon-accent/50 focus:outline-none
                placeholder:text-denon-muted/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-denon-muted hover:text-denon-text transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {isSearching && (
            <p className="text-[10px] text-denon-muted mt-1.5 ml-1">
              {searchInfo}
            </p>
          )}
        </div>

        {/* Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-3 sm:p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          {loading && !isSearching && (
            <div className="flex flex-col items-center gap-4 py-12">
              {/* Progress bar */}
              <div className="w-48 h-1 bg-denon-surface rounded-full overflow-hidden">
                <div className="h-full bg-denon-gold rounded-full animate-pulse"
                  style={{ width: '60%', animation: 'loading 1.5s ease-in-out infinite' }} />
              </div>
              <p className="text-xs text-denon-muted">Loading stations...</p>
              <style>{`
                @keyframes loading {
                  0% { width: 10%; margin-left: 0; }
                  50% { width: 60%; margin-left: 20%; }
                  100% { width: 10%; margin-left: 90%; }
                }
              `}</style>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-denon-red">{error}</p>
              <button
                onClick={() => setRetryCount(c => c + 1)}
                className="text-xs text-denon-gold hover:text-denon-text transition-colors px-3 py-1.5 rounded-lg bg-denon-surface"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && displayItems.length === 0 && !isSearching && (
            <p className="text-center text-sm text-denon-muted py-12">No stations found in this category</p>
          )}

          {isSearching && searchResults.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-denon-muted">No matches found</p>
              <p className="text-xs text-denon-muted/60 mt-1">Stations are preloaded on startup — try a different search term</p>
            </div>
          )}

          {!loading && !error && displayItems.length > 0 && (
            <div className={isTopLevel ? 'grid grid-cols-3 gap-2 sm:gap-3' : 'space-y-1'}>
              {displayItems.map((item, idx) => {
                const label = decodeLabel(item.name)
                const isContainer = item.container === 'yes'
                const isPlaying = playingMid === item.mid
                const fav = isFavorite(item)
                const img = safeImageUrl(item.image_url)

                if (isTopLevel && !isSearching && isContainer) {
                  // Category card layout
                  return (
                    <button
                      key={item.cid || idx}
                      onClick={() => handleItemClick(item)}
                      className="flex flex-col items-center justify-center gap-2 py-5 px-2 rounded-xl
                        bg-denon-surface/70 text-denon-text hover:bg-denon-surface
                        hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <span className="text-2xl">{CATEGORY_ICONS[item.name] || CATEGORY_ICONS[label] || '📁'}</span>
                      <span className="text-xs font-medium text-center leading-tight">{label}</span>
                    </button>
                  )
                }

                // List layout for stations and sub-categories
                return (
                  <button
                    key={item.mid || item.cid || idx}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all
                      ${isPlaying
                        ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
                        : 'bg-denon-surface/50 hover:bg-denon-surface hover:scale-[1.01] active:scale-[0.99]'
                      }`}
                  >
                    {img ? (
                      <img src={img} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-denon-surface" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-denon-surface/80 flex items-center justify-center shrink-0">
                        <span className="text-lg">{FLAGS[label] || (isContainer ? '📁' : '📻')}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-denon-text truncate">{label}</p>
                    </div>
                    {isContainer && (
                      <svg className="w-4 h-4 text-denon-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                    {item.playable === 'yes' && item.mid && (
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(item) }}
                        className={`px-2 py-1 rounded-lg text-sm shrink-0 ${fav ? 'text-denon-gold bg-denon-gold/10' : 'text-denon-muted hover:text-denon-gold hover:bg-denon-surface'}`}
                        title={fav ? 'Remove favorite' : 'Add favorite'}
                      >
                        {fav ? '★' : '☆'}
                      </span>
                    )}
                    {isPlaying && (
                      <span className="w-2 h-2 rounded-full bg-denon-gold shrink-0 animate-pulse" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

function decodeLabel(name) {
  if (!name) return ''
  try {
    return decodeURIComponent(name.replace(/%26/g, '&').replace(/%25/g, '%'))
  } catch {
    return name.replace(/%26/g, '&')
  }
}
