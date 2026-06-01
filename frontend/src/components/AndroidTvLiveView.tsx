import React, { useEffect, useRef, useState } from 'react'

export interface ScreenshotPreset {
  label: string
  format: 'jpeg' | 'png'
  maxWidth: number | null
  quality: number
}

export const SCREENSHOT_PRESETS: Record<string, ScreenshotPreset> = {
  low: { label: 'Low', format: 'jpeg', maxWidth: 640, quality: 45 },
  medium: { label: 'Medium', format: 'jpeg', maxWidth: 960, quality: 60 },
  full: { label: 'Full', format: 'png', maxWidth: null, quality: 80 },
}

export interface LiveIntervalPreset {
  label: string
  delay: number
}

export const LIVE_INTERVALS: Record<string, LiveIntervalPreset> = {
  fast: { label: 'Fast', delay: 350 },
  balanced: { label: 'Balanced', delay: 700 },
  slow: { label: 'Slow', delay: 1500 },
}

const OVERLAY_KEYS: Record<string, [string, string]> = {
  up: ['DPAD_UP', 'Up'],
  down: ['DPAD_DOWN', 'Down'],
  left: ['DPAD_LEFT', 'Left'],
  right: ['DPAD_RIGHT', 'Right'],
  ok: ['DPAD_CENTER', 'OK'],
  back: ['BACK', 'Back'],
  home: ['HOME', 'Home'],
  menu: ['MENU', 'Menu'],
  playPause: ['MEDIA_PLAY_PAUSE', 'Play/Pause'],
}

interface TinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

function TinyButton({ children, className = '', ...props }: TinyButtonProps) {
  return (
    <button
      type="button"
      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function vibrate() {
  try {
    navigator?.vibrate?.(12)
  } catch {
    // Browser vibration support is optional.
  }
}

export interface AndroidTvLiveViewProps {
  adbConnected: boolean
  remoteConnected: boolean
  onRemoteKey?: (key: string, label: string) => Promise<boolean> | void
  variant?: 'panel' | 'mini' | 'dialogButton'
  defaultQuality?: 'low' | 'medium' | 'full'
  defaultInterval?: 'fast' | 'balanced' | 'slow'
  defaultLive?: boolean
  className?: string
}

export default function AndroidTvLiveView({
  adbConnected,
  remoteConnected,
  onRemoteKey,
  variant = 'panel',
  defaultQuality = 'medium',
  defaultInterval = 'balanced',
  defaultLive = false,
  className = '',
}: AndroidTvLiveViewProps) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [live, setLive] = useState(defaultLive)
  const [quality, setQuality] = useState<'low' | 'medium' | 'full'>(defaultQuality as 'low' | 'medium' | 'full')
  const [interval, setIntervalPreset] = useState<'fast' | 'balanced' | 'slow'>(defaultInterval as 'fast' | 'balanced' | 'slow')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const screenshotRef = useRef<string | null>(null)
  const busyRef = useRef(false)

  const isMini = variant === 'mini'
  const isDialogButton = variant === 'dialogButton'
  const qualityPreset = SCREENSHOT_PRESETS[quality] || SCREENSHOT_PRESETS.medium
  const intervalPreset = LIVE_INTERVALS[interval] || LIVE_INTERVALS.balanced

  useEffect(() => {
    return () => clearScreenshot()
  }, [])

  useEffect(() => {
    if (!adbConnected) {
      setLive(false)
      clearScreenshot()
    }
  }, [adbConnected])

  useEffect(() => {
    if (!live || !adbConnected) return undefined
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      if (cancelled) return
      if (busyRef.current) {
        timer = window.setTimeout(tick, intervalPreset.delay)
        return
      }
      const ok = await refreshScreenshot({ trackBusy: false })
      const nextDelay = ok ? intervalPreset.delay : Math.max(intervalPreset.delay, 1500)
      if (!cancelled) timer = window.setTimeout(tick, nextDelay)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [live, adbConnected, quality, interval])

  const clearScreenshot = () => {
    if (screenshotRef.current) URL.revokeObjectURL(screenshotRef.current)
    screenshotRef.current = null
    setScreenshotUrl(null)
  }

  const refreshScreenshot = async (options: { trackBusy?: boolean } = {}) => {
    if (!adbConnected || busyRef.current) return false
    busyRef.current = true
    if (options.trackBusy !== false) setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        t: String(Date.now()),
        format: qualityPreset.format,
        quality: String(qualityPreset.quality),
      })
      if (qualityPreset.maxWidth) params.set('max_width', String(qualityPreset.maxWidth))
      const res = await fetch(`/api/v1/androidtv/adb/screenshot?${params.toString()}`)
      if (!res.ok) {
        const message = await res.text().catch(() => res.statusText)
        throw new Error(message || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      clearScreenshot()
      const url = URL.createObjectURL(blob)
      screenshotRef.current = url
      setScreenshotUrl(url)
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      busyRef.current = false
      if (options.trackBusy !== false) setBusy(false)
    }
  }

  const sendOverlayKey = async (keyId: string) => {
    const key = OVERLAY_KEYS[keyId]
    if (!key || !remoteConnected) return
    let ok = false
    if (onRemoteKey) {
      const res = onRemoteKey(key[0], key[1])
      ok = res instanceof Promise ? await res : Boolean(res)
    } else {
      try {
        const res = await fetch('/api/v1/androidtv/key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: key[0] }),
        })
        ok = res.ok
      } catch {
        ok = false
      }
    }
    if (ok && !onRemoteKey) vibrate()
  }

  const openFullscreen = () => {
    setFullscreen(true)
    if (adbConnected && !screenshotUrl) {
      window.setTimeout(() => refreshScreenshot(), 0)
    }
  }

  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        value={quality}
        onChange={e => setQuality(e.target.value as 'low' | 'medium' | 'full')}
        className="h-9 rounded-xl border border-denon-border bg-denon-surface px-3 py-1 text-xs font-semibold text-denon-text"
        title="Screenshot quality"
      >
        {Object.entries(SCREENSHOT_PRESETS).map(([id, preset]) => (
          <option key={id} value={id}>{preset.label}</option>
        ))}
      </select>
      <select
        value={interval}
        onChange={e => setIntervalPreset(e.target.value as 'fast' | 'balanced' | 'slow')}
        className="h-9 rounded-xl border border-denon-border bg-denon-surface px-3 py-1 text-xs font-semibold text-denon-text"
        title="Live refresh interval"
      >
        {Object.entries(LIVE_INTERVALS).map(([id, preset]) => (
          <option key={id} value={id}>{preset.label}</option>
        ))}
      </select>
      <TinyButton disabled={!adbConnected || busy} onClick={() => refreshScreenshot()} className="bg-denon-surface text-denon-text border border-denon-border">
        Screenshot
      </TinyButton>
      <button
        type="button"
        aria-label="Live screenshot refresh"
        title="Live refresh"
        disabled={!adbConnected}
        onClick={() => setLive(value => !value)}
        className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
          live
            ? 'border-denon-green/50 bg-denon-green/15 text-denon-green ring-1 ring-denon-green/40'
            : 'border-denon-border bg-denon-surface text-denon-text'
        }`}
      >
        <svg className={`h-4 w-4 ${live ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 1-15.5 6.2" />
          <path d="M3 12A9 9 0 0 1 18.5 5.8" />
          <path d="M18 2v4h-4" />
          <path d="M6 22v-4h4" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Open fullscreen live view"
        title="Fullscreen"
        disabled={!screenshotUrl}
        onClick={openFullscreen}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-denon-border bg-denon-surface text-denon-text transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  )

  if (isDialogButton) {
    return (
      <>
        <button
          type="button"
          onClick={openFullscreen}
          className={`flex remote-row-btn items-center justify-center gap-2 rounded-xl border border-denon-border bg-denon-surface/70 px-3 text-xs font-semibold text-denon-text transition-all active:scale-95 hover:border-denon-gold/40 ${className}`}
        >
          <svg className="h-4 w-4 text-denon-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          Live view
          {!adbConnected && <span className="text-denon-red">ADB off</span>}
        </button>
        {fullscreen && (
          <LiveViewModal
            screenshotUrl={screenshotUrl}
            controls={controls}
            remoteConnected={remoteConnected}
            adbConnected={adbConnected}
            onClose={() => setFullscreen(false)}
            onRemoteKey={sendOverlayKey}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className={`${isMini ? 'rounded-xl border border-denon-border/50 bg-denon-card/60 p-2' : 'rounded-xl border border-denon-border/50 bg-denon-surface/40 p-3 space-y-3'} ${className}`}>
        {!isMini && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-denon-muted uppercase">Live View</h3>
            {controls}
          </div>
        )}

        {isMini && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-denon-muted uppercase">Live View</p>
              <p className="text-[11px] text-denon-muted">{live ? intervalPreset.label : 'Tap to expand'}</p>
            </div>
            <button
              type="button"
              aria-label="Toggle mini live refresh"
              disabled={!adbConnected}
              onClick={() => setLive(value => !value)}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 disabled:opacity-40 ${
                live ? 'border-denon-green/50 bg-denon-green/15 text-denon-green' : 'border-denon-border bg-denon-surface text-denon-text'
              }`}
            >
              <svg className={`h-4 w-4 ${live ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 1-15.5 6.2" />
                <path d="M3 12A9 9 0 0 1 18.5 5.8" />
                <path d="M18 2v4h-4" />
                <path d="M6 22v-4h4" />
              </svg>
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={!screenshotUrl}
          onClick={openFullscreen}
          className="aspect-video relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-denon-border/60 bg-black/40 disabled:cursor-default"
        >
          {screenshotUrl ? (
            <img src={screenshotUrl} alt="Android TV screenshot" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-denon-muted">{adbConnected ? 'No screenshot' : 'ADB disconnected'}</span>
          )}
          {busy && (
            <span className="absolute right-2 top-2 h-4 w-4 rounded-full border-2 border-denon-gold/30 border-t-denon-gold animate-spin" />
          )}
        </button>

        {error && (
          <div className="mt-2 rounded-xl border border-denon-red/40 bg-denon-red/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        {isMini && (
          <div className="mt-2 flex gap-2">
            <TinyButton disabled={!adbConnected || busy} onClick={() => refreshScreenshot()} className="flex-1 bg-denon-surface text-denon-text border border-denon-border">
              Refresh
            </TinyButton>
            <TinyButton disabled={!screenshotUrl} onClick={openFullscreen} className="flex-1 bg-denon-gold text-denon-dark">
              Open
            </TinyButton>
          </div>
        )}
      </div>

      {fullscreen && (
        <LiveViewModal
          screenshotUrl={screenshotUrl}
          controls={controls}
          remoteConnected={remoteConnected}
          adbConnected={adbConnected}
          onClose={() => setFullscreen(false)}
          onRemoteKey={sendOverlayKey}
        />
      )}
    </>
  )
}

interface LiveViewModalProps {
  screenshotUrl: string | null
  controls: React.ReactNode
  remoteConnected: boolean
  adbConnected: boolean
  onClose: () => void
  onRemoteKey: (keyId: string) => void
}

function LiveViewModal({ screenshotUrl, controls, remoteConnected, adbConnected, onClose, onRemoteKey }: LiveViewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-denon-text">Android TV Live View</h3>
          <p className="text-xs text-denon-muted">
            {adbConnected ? remoteConnected ? 'Overlay controls enabled' : 'Remote disconnected' : 'ADB disconnected'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {controls}
          <TinyButton onClick={onClose} className="bg-denon-surface text-denon-text border border-denon-border">
            Close
          </TinyButton>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-denon-border/70 bg-black">
        {screenshotUrl ? (
          <img src={screenshotUrl} alt="Android TV fullscreen live view" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-denon-muted">No screenshot</div>
        )}

        <button aria-label="Up" disabled={!remoteConnected} onClick={() => onRemoteKey('up')} className="absolute left-1/4 right-1/4 top-0 h-1/4 rounded-b-3xl text-white/0 hover:bg-white/10 focus:bg-white/10 disabled:pointer-events-none" />
        <button aria-label="Down" disabled={!remoteConnected} onClick={() => onRemoteKey('down')} className="absolute bottom-0 left-1/4 right-1/4 h-1/4 rounded-t-3xl text-white/0 hover:bg-white/10 focus:bg-white/10 disabled:pointer-events-none" />
        <button aria-label="Left" disabled={!remoteConnected} onClick={() => onRemoteKey('left')} className="absolute bottom-1/4 left-0 top-1/4 w-1/4 rounded-r-3xl text-white/0 hover:bg-white/10 focus:bg-white/10 disabled:pointer-events-none" />
        <button aria-label="Right" disabled={!remoteConnected} onClick={() => onRemoteKey('right')} className="absolute bottom-1/4 right-0 top-1/4 w-1/4 rounded-l-3xl text-white/0 hover:bg-white/10 focus:bg-white/10 disabled:pointer-events-none" />
        <button aria-label="OK" disabled={!remoteConnected} onClick={() => onRemoteKey('ok')} className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/10 text-sm font-semibold text-white/40 hover:bg-white/10 hover:text-white focus:bg-white/10 disabled:pointer-events-none sm:h-36 sm:w-36">
          OK
        </button>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/10 bg-black/70 p-2 backdrop-blur">
          <OverlayButton label="Back" disabled={!remoteConnected} onClick={() => onRemoteKey('back')} />
          <OverlayButton label="Home" disabled={!remoteConnected} onClick={() => onRemoteKey('home')} />
          <OverlayButton label="Menu" disabled={!remoteConnected} onClick={() => onRemoteKey('menu')} />
          <OverlayButton label="Play/Pause" disabled={!remoteConnected} onClick={() => onRemoteKey('playPause')} />
        </div>
      </div>
    </div>
  )
}

interface OverlayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

function OverlayButton({ label, ...props }: OverlayButtonProps) {
  return (
    <button
      type="button"
      className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      {...props}
    >
      {label}
    </button>
  )
}
