import { useEffect, useRef, useState } from 'react'
import ModalShell from '../ModalShell'
import type { RadioFavorite } from '../../types'
import { useApi } from '../../hooks/useApi'
import { HIDDEN_CATEGORIES, decodeLabel, type RadioItem } from './constants'
import { useRadioStatus } from './useRadioStatus'
import { useRadioBrowse } from './useRadioBrowse'
import { useRadioSearch } from './useRadioSearch'
import RadioList from './RadioList'

interface Props {
  open: boolean
  onClose: () => void
  favorites?: RadioFavorite[]
  onFavoriteChange?: (favorite: RadioFavorite, enabled: boolean) => void | Promise<void>
}

/** TuneIn browser modal: header, search, guidance panel and the station list. */
export default function RadioBrowser({ open, onClose, favorites = [], onFavoriteChange }: Props) {
  const { post } = useApi()
  const [playingMid, setPlayingMid] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const browse = useRadioBrowse({ open, favorites })
  const status = useRadioStatus({
    open,
    onBeforeRefresh: browse.clearCache,
    onAfterRefresh: browse.retry,
  })
  const { radioStatus, statusChecking, preloading, refreshStations } = status
  const cachedCount = radioStatus?.cached_stations ?? 0
  const search = useRadioSearch(cachedCount)
  const { navStack, items, loading, error, setError, currentTitle } = browse
  const { searchQuery, setSearchQuery, searchResults, searchInfo, isSearching } = search

  // Reset nav stack when the modal opens (the ref carries the latest render's
  // callbacks). Keep the cache across opens — categories don't change.
  const onOpenRef = useRef<() => void>(() => {})
  onOpenRef.current = () => {
    browse.resetNav()
    setPlayingMid(null)
    setSearchQuery('')
  }
  useEffect(() => {
    if (open) onOpenRef.current()
  }, [open])

  // ModalShell's animated close, captured from its render prop.
  const closeRef = useRef<() => void>(onClose)

  // Scroll to top on navigation
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [navStack.length])

  const isFavorite = (item: RadioItem | null | undefined): boolean =>
    Boolean(item?.mid && favorites.some(f => f.mid === item.mid))

  const toggleFavorite = async (item: RadioItem) => {
    if (!item?.mid) return
    await onFavoriteChange?.({
      mid: item.mid,
      name: decodeLabel(item.name) || item.station || item.mid,
      image_url: item.image_url || undefined,
      station: item.station || undefined,
    }, !isFavorite(item))
  }

  const handleItemClick = async (item: RadioItem) => {
    if (item.container === 'yes') {
      browse.pushNav({ title: decodeLabel(item.name), cid: item.cid })
    } else if (item.playable === 'yes' && item.mid) {
      setPlayingMid(item.mid)
      const res = await post('/media/radio/play', { mid: item.mid })  // toasts on failure
      if (res.ok) {
        setTimeout(() => closeRef.current(), 600)
      } else {
        setPlayingMid(null)
        setError('Could not play station')
        setTimeout(() => setError(null), 3000)
      }
    }
  }

  const handleBack = () => {
    browse.popNav()
    setSearchQuery('')
  }

  if (!open) return null

  const isTopLevel = navStack.length === 0 && !isSearching

  // Guidance panel: shown when internet radio isn't usable (signed out etc.)
  const showGuide = !!radioStatus && !radioStatus.ready && !isSearching
  const guide = (() => {
    const b = (t: string) => <b className="text-denon-text font-semibold">{t}</b>
    switch (radioStatus?.reason) {
      case 'signed_out':
        return {
          icon: '🔒',
          title: 'HEOS account signed out',
          body: 'Internet radio (TuneIn) needs a HEOS account signed in on the receiver. Your AVR is currently signed out, so no stations are available.',
          steps: [
            <>Open the {b('HEOS')} app on your phone (same Wi-Fi as the receiver).</>,
            <>Go to {b('Settings → HEOS Account → Sign In')}.</>,
            <>Sign in with your HEOS / Denon account.</>,
            <>Come back here and tap {b('Check again')}.</>,
          ],
        }
      case 'no_heos':
        return {
          icon: '📡',
          title: 'Receiver unreachable',
          body: "Can't reach the receiver's HEOS service (port 1255). Make sure the AVR is powered on and on the network, then try again.",
          steps: [
            <>Check the receiver is {b('powered on')} (not in deep standby).</>,
            <>Confirm it's on the same network as this dashboard.</>,
            <>Tap {b('Check again')}.</>,
          ],
        }
      case 'tunein_unavailable':
        return {
          icon: '⏳',
          title: 'TuneIn not ready yet',
          body: "Your HEOS account is signed in, but TuneIn isn't available yet. This can take a moment right after signing in.",
          steps: [<>Wait a few seconds.</>, <>Tap {b('Check again')}.</>],
        }
      default:
        return {
          icon: '⚠️',
          title: 'Internet radio unavailable',
          body: "Radio stations can't be loaded right now.",
          steps: [<>Tap {b('Check again')}.</>],
        }
    }
  })()

  const filteredItems = isTopLevel
    ? items.filter(i => !HIDDEN_CATEGORIES.has(i.name) && !HIDDEN_CATEGORIES.has(decodeLabel(i.name)))
    : items
  const displayItems = isSearching ? (searchResults ?? []) : filteredItems

  const backButton = !isTopLevel && (
    <button
      onClick={handleBack}
      aria-label="Back"
      className="text-denon-muted hover:text-denon-text transition-colors p-1"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  )

  const countBadge = preloading ? (
    <span className="text-xs text-denon-muted bg-denon-surface px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 shrink-0" data-testid="radio-preload">
      <span className="w-2.5 h-2.5 border-2 border-denon-gold/30 border-t-denon-gold rounded-full animate-spin" />
      Loading stations…
    </span>
  ) : cachedCount > 0 ? (
    <span className="text-sm text-denon-muted bg-denon-surface px-2.5 py-1 rounded-full font-medium shrink-0">
      📻 {cachedCount}
    </span>
  ) : (
    <span className="text-xs text-denon-muted bg-denon-surface px-2.5 py-1 rounded-full font-medium flex items-center gap-2 shrink-0" data-testid="radio-empty">
      0 stations cached
      <button
        onClick={refreshStations}
        disabled={statusChecking}
        className="text-denon-gold hover:text-denon-text transition-colors font-semibold disabled:opacity-50"
      >
        Retry
      </button>
    </span>
  )

  const refreshButton = (
    <button
      onClick={refreshStations}
      disabled={preloading || statusChecking}
      className={`p-1.5 transition-all ${
        preloading
          ? 'text-denon-gold/40 cursor-wait'
          : 'text-denon-muted hover:text-denon-text'
      }`}
      title={preloading ? 'Refreshing...' : 'Refresh station list'}
      aria-label="Refresh station list"
    >
      <svg className={`w-5 h-5 ${preloading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 4v6h6M23 20v-6h-6" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
      </svg>
    </button>
  )

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      modalId="radio"
      title={currentTitle}
      headerLeft={backButton}
      titleAside={countBadge}
      headerRight={refreshButton}
      closeLabel="Close radio browser"
    >
      {close => {
        closeRef.current = close
        return (
          <>
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
                    aria-label="Clear search"
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
              {showGuide ? (
                <div className="flex flex-col items-center text-center gap-5 py-8 px-2">
                  <div className="w-16 h-16 rounded-full bg-denon-gold/10 flex items-center justify-center text-3xl">
                    {guide.icon}
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold text-denon-text">{guide.title}</h3>
                    <p className="text-sm text-denon-muted max-w-sm leading-relaxed">{guide.body}</p>
                  </div>
                  <ol className="text-left text-sm text-denon-text/90 space-y-2.5 max-w-sm w-full bg-denon-surface/40 rounded-xl p-4">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-denon-gold/15 text-denon-gold text-xs font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="leading-snug">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <button
                    onClick={refreshStations}
                    disabled={statusChecking}
                    className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                      statusChecking
                        ? 'bg-denon-surface text-denon-muted cursor-wait'
                        : 'bg-denon-gold text-denon-dark hover:brightness-110 active:scale-[0.98]'
                    }`}
                  >
                    {statusChecking ? 'Checking…' : 'Check again'}
                  </button>
                  {radioStatus?.account_signed_in && radioStatus?.username && (
                    <p className="text-[10px] text-denon-muted/60">Signed in as {radioStatus.username}</p>
                  )}
                </div>
              ) : (
                <RadioList
                  items={displayItems}
                  isTopLevel={isTopLevel}
                  isSearching={isSearching}
                  loading={loading}
                  error={error}
                  playingMid={playingMid}
                  isFavorite={isFavorite}
                  onItemClick={handleItemClick}
                  onToggleFavorite={toggleFavorite}
                  onRetry={browse.retry}
                />
              )}
            </div>
          </>
        )
      }}
    </ModalShell>
  )
}
