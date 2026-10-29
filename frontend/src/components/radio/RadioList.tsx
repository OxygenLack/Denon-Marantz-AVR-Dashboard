import { CATEGORY_ICONS, FLAGS, decodeLabel, safeImageUrl, type RadioItem } from './constants'

interface Props {
  items: RadioItem[]
  isTopLevel: boolean
  isSearching: boolean
  loading: boolean
  error: string | null
  playingMid: string | null
  isFavorite: (item: RadioItem) => boolean
  onItemClick: (item: RadioItem) => void
  onToggleFavorite: (item: RadioItem) => void
  onRetry: () => void
}

/** Loading / error / empty states and the category grid or station list. */
export default function RadioList({
  items, isTopLevel, isSearching, loading, error, playingMid,
  isFavorite, onItemClick, onToggleFavorite, onRetry,
}: Props) {
  return (
    <>
      {loading && !isSearching && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-48 h-1 bg-denon-surface rounded-full overflow-hidden">
            <div className="h-full bg-denon-gold rounded-full radio-loading-bar" />
          </div>
          <p className="text-xs text-denon-muted">Loading stations...</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-denon-red">{error}</p>
          <button
            onClick={onRetry}
            className="text-xs text-denon-gold hover:text-denon-text transition-colors px-3 py-1.5 rounded-lg bg-denon-surface"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && !isSearching && (
        <p className="text-center text-sm text-denon-muted py-12">No stations found in this category</p>
      )}

      {isSearching && items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-denon-muted">No matches found</p>
          <p className="text-xs text-denon-muted/60 mt-1">Stations are preloaded on startup — try a different search term</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className={isTopLevel ? 'grid grid-cols-3 gap-2 sm:gap-3' : 'space-y-1'}>
          {items.map((item, idx) => {
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
                  onClick={() => onItemClick(item)}
                  className="flex flex-col items-center justify-center gap-2 py-5 px-2 rounded-xl
                    bg-denon-surface/70 text-denon-text hover:bg-denon-surface
                    hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl">{CATEGORY_ICONS[item.name] || CATEGORY_ICONS[label] || '📁'}</span>
                  <span className="text-xs font-medium text-center leading-tight">{label}</span>
                </button>
              )
            }

            // List layout for stations and sub-categories. The favorite star is
            // a sibling of the row button, not nested inside it.
            return (
              <div
                key={item.mid || item.cid || idx}
                className={`flex items-center rounded-xl transition-all
                  ${isPlaying
                    ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
                    : 'bg-denon-surface/50 hover:bg-denon-surface hover:scale-[1.01] active:scale-[0.99]'
                  }`}
              >
                <button
                  onClick={() => onItemClick(item)}
                  className="min-w-0 flex-1 flex items-center gap-3 py-2.5 px-3 text-left"
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
                  {isPlaying && (
                    <span className="w-2 h-2 rounded-full bg-denon-gold shrink-0 animate-pulse" />
                  )}
                </button>
                {item.playable === 'yes' && item.mid && (
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(item)}
                    aria-label={fav ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
                    aria-pressed={fav}
                    className={`mr-2 px-2 py-1 rounded-lg text-sm shrink-0 ${fav ? 'text-denon-gold bg-denon-gold/10' : 'text-denon-muted hover:text-denon-gold hover:bg-denon-surface'}`}
                    title={fav ? 'Remove favorite' : 'Add favorite'}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
