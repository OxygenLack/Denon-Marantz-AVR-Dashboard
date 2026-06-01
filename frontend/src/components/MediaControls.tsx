import { motion } from 'framer-motion'
import type { ReceiverState, SendCommandFn, PostFn, Zone } from '../types'

const MEDIA_SOURCES = new Set(['NET', 'MPLAY', 'BT', 'USB', 'USB/IPOD', 'SPOTIFY', 'PANDORA', 'SIRIUSXM', 'IRADIO', 'SERVER', 'FAVORITES'])
const VALID_ACTIONS = new Set(['play', 'pause', 'stop', 'next', 'previous'])

function safeImageUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null
  } catch { return null }
}

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  post: PostFn
  zone?: Zone
}

export default function MediaControls({ state, zone = 'main' }: Props) {
  const source = zone === 'main' ? state.source : state.z2_source
  const mediaCapable = source != null && MEDIA_SOURCES.has(source)

  const nowPlaying = state.now_playing
  const playState = state.play_state

  const doMedia = async (action: string) => {
    if (!VALID_ACTIONS.has(action)) return
    try {
      await fetch(`/api/v1/media/${action}`, { method: 'POST' })
    } catch { /* ignore */ }
  }

  if (!mediaCapable) return null

  const isPlaying = playState === 'play'
  const song = nowPlaying?.song
  const artist = nowPlaying?.artist
  const station = nowPlaying?.station
  const albumArt = safeImageUrl(nowPlaying?.image_url)
  const streamQuality = state.stream_quality

  const title = song ?? station
  const subtitle = artist ?? (song && station ? station : null)

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-denon-text mb-3">Now Playing</h2>

      {(title ?? subtitle) && (
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
                : 'bg-denon-surface text-denon-muted'
            }`}>
              {isPlaying ? '▶ Playing' : '⏸ Paused'}
            </span>
            {streamQuality && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-denon-surface text-denon-muted">
                {streamQuality}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <motion.button
          onClick={() => doMedia('previous')}
          whileTap={{ scale: 0.9 }}
          className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all flex items-center justify-center"
          title="Previous"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </motion.button>

        <motion.button
          onClick={() => doMedia(isPlaying ? 'pause' : 'play')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="w-14 h-14 rounded-2xl bg-denon-gold text-denon-dark shadow-md shadow-denon-gold/20 hover:brightness-110 transition-all flex items-center justify-center"
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
        </motion.button>

        <motion.button
          onClick={() => doMedia('next')}
          whileTap={{ scale: 0.9 }}
          className="w-11 h-11 rounded-xl bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-all flex items-center justify-center"
          title="Next"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </motion.button>
      </div>
    </div>
  )
}
