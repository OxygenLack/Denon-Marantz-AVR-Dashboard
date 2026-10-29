import type { ReceiverState, PostFn, Zone } from '../types'
import { safeImageUrl } from './radio/constants'

const VALID_ACTIONS = new Set(['play', 'pause', 'stop', 'next', 'previous'])

interface Props {
  state: ReceiverState
  post: PostFn
  /** Inputs the HEOS transport drives (from /device.media_sources). */
  mediaSources: string[]
  zone?: Zone
}

function playStateLabel(playState: string | undefined): string {
  if (playState === 'play') return '▶ Playing'
  if (playState === 'stop') return '■ Stopped'
  return '⏸ Paused'
}

export const HEOS_OFFLINE_HINT = 'Media control unavailable - HEOS not connected'

export default function MediaControls({ state, post, mediaSources, zone = 'main' }: Props) {
  const source = zone === 'main' ? state?.source : state?.z2_source
  const mediaCapable = source != null && mediaSources.includes(source)
  const heosDown = state?.heos_connected === false

  // Now-playing data comes from WebSocket state (backend polls HEOS once for all clients)
  const nowPlaying = state?.now_playing
  const playState = state?.play_state

  const doMedia = (action: string) => {
    if (!VALID_ACTIONS.has(action) || heosDown) return
    void post(`/media/${action}`)  // failures toast inside post()
  }

  if (!mediaCapable) return null

  const isPlaying = playState === 'play'
  const song = nowPlaying?.song
  const artist = nowPlaying?.artist
  const station = nowPlaying?.station
  const albumArt = safeImageUrl(nowPlaying?.image_url)
  const streamQuality = state?.stream_quality

  // For radio/stations: show station name when no song title is available
  const title = song || station
  const subtitle = artist || (song && station ? station : null)

  return (
    <div className="card">
      <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-3">Now Playing</h2>

      {/* Now Playing Info */}
      {(title || subtitle) && (
        <div className="flex items-center gap-3 mb-4">
          {albumArt && (
            <img
              src={albumArt}
              alt="Album art"
              className="w-12 h-12 rounded-lg object-cover shadow-md flex-shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            {title && <p className="text-sm font-medium text-denon-text truncate">{title}</p>}
            {subtitle && <p className="text-xs text-denon-muted truncate">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              isPlaying
                ? 'bg-denon-green/10 text-denon-green'
                : 'bg-denon-surface text-denon-text'
            }`}>
              {playStateLabel(playState)}
            </span>
            {streamQuality && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-denon-surface text-denon-text">
                {streamQuality}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Transport Controls */}
      <div className={`flex items-center justify-center gap-3 ${heosDown ? 'opacity-40' : ''}`}>
        <button
          onClick={() => doMedia('previous')}
          disabled={heosDown}
          className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 flex items-center justify-center disabled:cursor-not-allowed"
          title="Previous"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        <button
          onClick={() => doMedia(isPlaying ? 'pause' : 'play')}
          disabled={heosDown}
          className="disabled:cursor-not-allowed w-14 h-14 rounded-2xl bg-gradient-to-br from-denon-gold to-amber-600 text-denon-dark shadow-lg shadow-denon-gold/25 hover:brightness-110 transition-all active:scale-95 flex items-center justify-center"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        <button
          onClick={() => doMedia('next')}
          disabled={heosDown}
          className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all active:scale-95 flex items-center justify-center disabled:cursor-not-allowed"
          title="Next"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>
      {heosDown && (
        <p className="text-center text-xs text-denon-muted mt-3">{HEOS_OFFLINE_HINT}</p>
      )}
    </div>
  )
}
