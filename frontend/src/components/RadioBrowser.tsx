import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SPIN, PULSE } from '../variants'

interface RadioItem {
  cid?: string
  mid?: string
  name: string
  container?: 'yes' | 'no'
  playable?: 'yes' | 'no'
  image_url?: string
}

interface NavEntry {
  title: string
  cid: string | null
}

interface Props {
  open: boolean
  onClose: () => void
}

const CATEGORY_ICONS: Record<string, string> = {
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

const FLAGS: Record<string, string> = {
  'Afghanistan': '🇦🇫', 'Albania': '🇦🇱', 'Algeria': '🇩🇿', 'American Samoa': '🇦🇸',
  'Andorra': '🇦🇩', 'Argentina': '🇦🇷', 'Armenia': '🇦🇲', 'Australia': '🇦🇺',
  'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿', 'Bahrain': '🇧🇭', 'Bangladesh': '🇧🇩',
  'Belarus': '🇧🇾', 'Belgium': '🇧🇪', 'Belize': '🇧🇿', 'Benin': '🇧🇯',
  'Bermuda': '🇧🇲', 'Bolivia': '🇧🇴', 'Bosnia and Herzegovina': '🇧🇦',
  'Botswana': '🇧🇼', 'Brazil': '🇧🇷', 'Brunei Darussalam': '🇧🇳', 'Bulgaria': '🇧🇬',
  'Burkina Faso': '🇧🇫', 'Burundi': '🇧🇮', 'Cambodia': '🇰🇭', 'Cameroon': '🇨🇲',
  'Canada': '🇨🇦', 'Caribbean Islands': '🏝️', 'Central African Republic': '🇨🇫',
  'Chad': '🇹🇩', 'Chile': '🇨🇱', 'China': '🇨🇳', 'Colombia': '🇨🇴',
  'Congo': '🇨🇬', 'Cook Islands': '🇨🇰', 'Costa Rica': '🇨🇷', "Cote D'ivoire": '🇨🇮',
  'Croatia': '🇭🇷', 'Cyprus': '🇨🇾', 'Czech Republic': '🇨🇿', 'DR Congo': '🇨🇩',
  'Denmark': '🇩🇰', 'East Timor': '🇹🇱', 'Ecuador': '🇪🇨', 'Egypt': '🇪🇬',
  'El Salvador': '🇸🇻', 'Eritrea': '🇪🇷', 'Estonia': '🇪🇪', 'Ethiopia': '🇪🇹',
  'Fiji': '🇫🇯', 'Finland': '🇫🇮', 'France': '🇫🇷', 'French Guiana': '🇬🇫',
  'French Polynesia': '🇵🇫', 'Gabon': '🇬🇦', 'Gambia': '🇬🇲', 'Georgia': '🇬🇪',
  'Germany': '🇩🇪', 'Ghana': '🇬🇭', 'Greece': '🇬🇷', 'Greenland': '🇬🇱',
  'Guam': '🇬🇺', 'Guatemala': '🇬🇹', 'Guinea': '🇬🇳', 'Guyana': '🇬🇾',
  'Honduras': '🇭🇳', 'Hong Kong': '🇭🇰', 'Hungary': '🇭🇺', 'Iceland': '🇮🇸',
  'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iraq': '🇮🇶', 'Ireland': '🇮🇪',
  'Israel': '🇮🇱', 'Italy': '🇮🇹', 'Japan': '🇯🇵', 'Jordan': '🇯🇴',
  'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪', 'Kosovo': '🇽🇰', 'Kuwait': '🇰🇼',
  'Latvia': '🇱🇻', 'Lebanon': '🇱🇧', 'Libya': '🇱🇾', 'Liechtenstein': '🇱🇮',
  'Lithuania': '🇱🇹', 'Luxembourg': '🇱🇺', 'Malaysia': '🇲🇾', 'Mali': '🇲🇱',
  'Malta': '🇲🇹', 'Mauritius': '🇲🇺', 'Mexico': '🇲🇽', 'Moldova': '🇲🇩',
  'Monaco': '🇲🇨', 'Mongolia': '🇲🇳', 'Montenegro': '🇲🇪', 'Morocco': '🇲🇦',
  'Mozambique': '🇲🇿', 'Namibia': '🇳🇦', 'Nepal': '🇳🇵', 'Netherlands': '🇳🇱',
  'New Zealand': '🇳🇿', 'Nicaragua': '🇳🇮', 'Nigeria': '🇳🇬', 'Norway': '🇳🇴',
  'Oman': '🇴🇲', 'Pakistan': '🇵🇰', 'Palestine': '🇵🇸', 'Panama': '🇵🇦',
  'Peru': '🇵🇪', 'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹',
  'Qatar': '🇶🇦', 'Romania': '🇷🇴', 'Russia': '🇷🇺', 'Rwanda': '🇷🇼',
  'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳', 'Serbia': '🇷🇸', 'Singapore': '🇸🇬',
  'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
  'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰', 'Sudan': '🇸🇩', 'Sweden': '🇸🇪',
  'Switzerland': '🇨🇭', 'Syria': '🇸🇾', 'Taiwan': '🇹🇼', 'Tajikistan': '🇹🇯',
  'Tanzania': '🇹🇿', 'Thailand': '🇹🇭', 'Togo': '🇹🇬', 'Tunisia': '🇹🇳',
  'Turkey': '🇹🇷', 'Uganda': '🇺🇬', 'Ukraine': '🇺🇦', 'United Arab Emirates': '🇦🇪',
  'United Kingdom': '🇬🇧', 'United States': '🇺🇸', 'Uruguay': '🇺🇾',
  'Venezuela': '🇻🇪', 'Yemen': '🇾🇪', 'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼',
  'Africa': '🌍', 'Asia': '🌏', 'Europe': '🇪🇺', 'North America': '🌎', 'South America': '🌎',
  'Country': '🤠', 'Rock Music': '🎸', 'Jazz': '🎹', 'Hip Hop': '🎤',
  'Classical Music': '🎻', 'Dance & Electronic': '🎧', 'Dance %26 Electronic': '🎧',
  'Latin Music': '💃', 'Blues': '🎵', 'Folk': '🪕', 'Reggae & Dancehall': '🌴',
  'Soul & R&B': '🎷', 'Top 40 & Pop Music': '🎤', 'College Radio': '🎓',
  'Easy Listening': '☕',
}

function safeImageUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null
  } catch { return null }
}

function decodeLabel(name: string | undefined): string {
  if (!name) return ''
  try {
    return decodeURIComponent(name.replace(/%26/g, '&').replace(/%25/g, '%'))
  } catch {
    return name.replace(/%26/g, '&')
  }
}

export default function RadioBrowser({ open, onClose }: Props) {
  const [navStack, setNavStack] = useState<NavEntry[]>([])
  const [items, setItems] = useState<RadioItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playingMid, setPlayingMid] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RadioItem[] | null>(null)
  const [searchInfo, setSearchInfo] = useState('')
  const [cachedCount, setCachedCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const fetchIdRef = useRef(0)
  const cacheRef = useRef(new Map<string, RadioItem[]>())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const refreshTargetRef = useRef(0)
  const prevOpenRef = useRef(false)

  const currentTitle = navStack.length > 0 ? navStack[navStack.length - 1].title : 'Internet Radio'
  const currentCid = navStack.length > 0 ? navStack[navStack.length - 1].cid : null
  const cacheKey = currentCid ?? '__root__'

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setNavStack([])
      setPlayingMid(null)
      setRetryCount(0)
      setSearchQuery('')
    }
    prevOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const cached = cacheRef.current.get(cacheKey)
    if (cached) { setItems(cached); setLoading(false); setError(null); return }

    const id = ++fetchIdRef.current
    const controller = new AbortController()
    setLoading(true); setError(null); setItems([])

    const url = currentCid
      ? `/api/v1/media/radio/browse?cid=${encodeURIComponent(currentCid)}`
      : '/api/v1/media/radio/browse'
    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch(url, { signal: controller.signal })
      .then(resp => { clearTimeout(timeout); if (!resp.ok) throw new Error(`HTTP ${resp.status}`); return resp.json() as Promise<{ items: RadioItem[] }> })
      .then(data => {
        if (fetchIdRef.current !== id) return
        const fetched = data.items ?? []
        cacheRef.current.set(cacheKey, fetched)
        setItems(fetched); setLoading(false)
      })
      .catch(err => {
        clearTimeout(timeout)
        if (fetchIdRef.current !== id) return
        setError((err as Error).name === 'AbortError' ? 'Request timed out' : 'Failed to load stations')
        setItems([]); setLoading(false)
      })

    return () => { controller.abort() }
  }, [open, cacheKey, retryCount])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [navStack.length])

  useEffect(() => {
    if (!open) return
    let active = true
    const poll = async () => {
      try {
        const r = await fetch('/api/v1/media/radio/search?q=__')
        const d = await r.json() as { cached_stations?: number }
        if (active) setCachedCount(d.cached_stations ?? 0)
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [open])

  useEffect(() => {
    if (refreshing && cachedCount >= refreshTargetRef.current && cachedCount > 0) {
      setRefreshing(false)
    }
  }, [cachedCount, refreshing])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) { setSearchResults(null); setSearchInfo(''); return }
    if (searchAbortRef.current) searchAbortRef.current.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    const timer = setTimeout(() => {
      fetch(`/api/v1/media/radio/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => r.json() as Promise<{ results?: RadioItem[]; cached_stations?: number }>)
        .then(data => {
          if (!controller.signal.aborted) {
            setSearchResults(data.results ?? [])
            setSearchInfo(`${data.results?.length ?? 0} of ${data.cached_stations ?? 0} stations`)
          }
        })
        .catch(() => {})
    }, 150)

    return () => { clearTimeout(timer); controller.abort() }
  }, [searchQuery, cachedCount])

  const handleItemClick = async (item: RadioItem) => {
    if (item.container === 'yes') {
      setNavStack(prev => [...prev, { title: decodeLabel(item.name), cid: item.cid ?? null }])
    } else if (item.playable === 'yes' && item.mid) {
      setPlayingMid(item.mid)
      try {
        const resp = await fetch('/api/v1/media/radio/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mid: item.mid }),
        })
        if (!resp.ok) throw new Error()
        setTimeout(onClose, 600)
      } catch {
        setPlayingMid(null)
        setError('Could not play station')
        setTimeout(() => setError(null), 3000)
      }
    }
  }

  const handleBack = () => { setNavStack(prev => prev.slice(0, -1)); setSearchQuery('') }

  const isSearching = searchResults !== null
  const isTopLevel = navStack.length === 0 && !isSearching
  const HIDDEN_CATEGORIES = new Set(['By Language'])
  const filteredItems = isTopLevel
    ? items.filter(i => !HIDDEN_CATEGORIES.has(i.name) && !HIDDEN_CATEGORIES.has(decodeLabel(i.name)))
    : items
  const displayItems = isSearching ? searchResults! : filteredItems

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="radio-backdrop"
            className="fixed inset-0 bg-black/70 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            key="radio-modal"
            className="fixed inset-2 sm:inset-auto sm:top-4 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl
              bg-denon-dark rounded-2xl z-50 flex flex-col overflow-hidden
              border border-denon-accent/40 shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-denon-border/30 shrink-0">
              <div className="flex items-center gap-2">
                {!isTopLevel && (
                  <motion.button
                    onClick={handleBack}
                    whileTap={{ scale: 0.9 }}
                    className="text-denon-muted hover:text-denon-text transition-colors p-1"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                  </motion.button>
                )}
                <h2 className="text-sm font-medium text-denon-text truncate">{currentTitle}</h2>
                <span className="text-sm text-denon-muted bg-denon-surface px-2.5 py-1 rounded-full font-medium">
                  📻 {cachedCount > 0 ? cachedCount : '...'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  onClick={async () => {
                    if (refreshing) return
                    refreshTargetRef.current = Math.max(cachedCount, 100)
                    setRefreshing(true); setCachedCount(0); cacheRef.current.clear()
                    try {
                      await fetch('/api/v1/media/radio/refresh', { method: 'POST' })
                      setRetryCount(c => c + 1)
                    } catch { setRefreshing(false) }
                  }}
                  disabled={refreshing}
                  whileTap={refreshing ? undefined : { scale: 0.9 }}
                  className={`p-1.5 transition-all ${refreshing ? 'text-denon-gold/40 cursor-wait' : 'text-denon-muted hover:text-denon-text'}`}
                  title={refreshing ? 'Refreshing...' : 'Refresh station list'}
                >
                  <motion.svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
                    transition={refreshing ? SPIN : { duration: 0 }}
                  >
                    <path d="M1 4v6h6M23 20v-6h-6" />
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                  </motion.svg>
                </motion.button>
                <motion.button
                  onClick={onClose}
                  whileTap={{ scale: 0.9 }}
                  className="text-denon-muted hover:text-denon-text transition-colors p-1"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </motion.button>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 sm:px-4 pt-3 shrink-0">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-denon-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stations..."
                  className="w-full bg-denon-surface/70 text-denon-text text-sm rounded-xl pl-10 pr-8 py-2.5 border border-denon-border/30 focus:border-denon-accent/50 focus:outline-none placeholder:text-denon-muted/50 transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2 text-denon-muted hover:text-denon-text transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {isSearching && <p className="text-[10px] text-denon-muted mt-1.5 ml-1">{searchInfo}</p>}
            </div>

            {/* Content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto p-3 sm:p-4" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              {loading && !isSearching && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="w-48 h-1 bg-denon-surface rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-denon-gold rounded-full"
                      style={{ width: '60%' }}
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={PULSE}
                    />
                  </div>
                  <p className="text-xs text-denon-muted">Loading stations...</p>
                </div>
              )}
              {error && !loading && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="text-sm text-denon-red">{error}</p>
                  <button onClick={() => setRetryCount(c => c + 1)} className="text-xs text-denon-gold hover:text-denon-text transition-colors px-3 py-1.5 rounded-lg bg-denon-surface">Retry</button>
                </div>
              )}
              {!loading && !error && displayItems.length === 0 && !isSearching && (
                <p className="text-center text-sm text-denon-muted py-12">No stations found in this category</p>
              )}
              {isSearching && searchResults!.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm text-denon-muted">No matches found</p>
                  <p className="text-xs text-denon-muted/60 mt-1">Try a different search term</p>
                </div>
              )}
              {!loading && !error && displayItems.length > 0 && (
                <div className={isTopLevel ? 'grid grid-cols-3 gap-2 sm:gap-3' : 'space-y-1'}>
                  {displayItems.map((item, idx) => {
                    const label = decodeLabel(item.name)
                    const isContainer = item.container === 'yes'
                    const isPlaying = playingMid === item.mid
                    const img = safeImageUrl(item.image_url)

                    if (isTopLevel && !isSearching && isContainer) {
                      return (
                        <motion.button
                          key={item.cid ?? idx}
                          onClick={() => handleItemClick(item)}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="flex flex-col items-center justify-center gap-2 py-5 px-2 rounded-xl bg-denon-surface/70 text-denon-text hover:bg-denon-surface transition-all"
                        >
                          <span className="text-2xl">{CATEGORY_ICONS[item.name] ?? CATEGORY_ICONS[label] ?? '📁'}</span>
                          <span className="text-xs font-medium text-center leading-tight">{label}</span>
                        </motion.button>
                      )
                    }

                    return (
                      <motion.button
                        key={item.mid ?? item.cid ?? idx}
                        onClick={() => handleItemClick(item)}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full flex items-center gap-3 py-2.5 px-3 rounded-xl text-left transition-all ${
                          isPlaying ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface/50 hover:bg-denon-surface'
                        }`}
                      >
                        {img ? (
                          <img src={img} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-denon-surface" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-denon-surface/80 flex items-center justify-center shrink-0">
                            <span className="text-lg">{FLAGS[label] ?? (isContainer ? '📁' : '📻')}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-denon-text truncate">{label}</p>
                        </div>
                        {isContainer && (
                          <svg className="w-4 h-4 text-denon-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                        )}
                        {isPlaying && (
                          <motion.span
                            className="w-2 h-2 rounded-full bg-denon-gold shrink-0"
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={PULSE}
                          />
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
