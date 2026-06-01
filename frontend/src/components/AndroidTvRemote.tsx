import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AndroidTvAdbPanel from './AndroidTvAdbPanel'
import AndroidTvLiveView from './AndroidTvLiveView'
import { ReceiverState, AndroidAdbState } from '../types'
import { fadeInUp, fadeIn, SPRING } from '../variants'

const KEYS: Record<string, string> = {
  up: 'DPAD_UP',
  down: 'DPAD_DOWN',
  left: 'DPAD_LEFT',
  right: 'DPAD_RIGHT',
  ok: 'DPAD_CENTER',
  back: 'BACK',
  home: 'HOME',
  menu: 'MENU',
  power: 'POWER',
  sleep: 'SLEEP',
  mute: 'VOLUME_MUTE',
  volUp: 'VOLUME_UP',
  volDown: 'VOLUME_DOWN',
  chUp: 'CHANNEL_UP',
  chDown: 'CHANNEL_DOWN',
  playPause: 'MEDIA_PLAY_PAUSE',
  stop: 'MEDIA_STOP',
  next: 'MEDIA_NEXT',
  prev: 'MEDIA_PREVIOUS',
}

interface IconButtonProps {
  label: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
  onClick?: (meta?: { repeat?: boolean }) => Promise<any> | any
  repeat?: boolean
  feedbackState?: 'ok' | 'fail' | null
}

function IconButton({
  label,
  children,
  className = '',
  disabled,
  onClick,
  repeat = false,
  feedbackState = null,
}: IconButtonProps) {
  const repeatTimer = useRef<number | null>(null)
  const repeatedPointer = useRef(false)
  const suppressFlash = useRef(false)
  const repeatCount = useRef(0)
  const [feedback, setFeedback] = useState<'ok' | 'fail' | null>(null)
  const [holding, setHolding] = useState(false)

  const getRepeatDelay = () => {
    if (repeatCount.current < 4) return 320
    if (repeatCount.current < 10) return 220
    if (repeatCount.current < 20) return 150
    return 95
  }

  const flash = (ok: boolean) => {
    if (suppressFlash.current) return
    setFeedback(ok ? 'ok' : 'fail')
    setTimeout(() => setFeedback(null), 180)
  }

  const run = async (meta: { repeat?: boolean } = {}) => {
    const result = await onClick?.(meta)
    flash(result !== false)
    return result
  }

  const stopRepeat = () => {
    if (repeatTimer.current) {
      clearTimeout(repeatTimer.current)
      repeatTimer.current = null
    }
    repeatCount.current = 0
    setHolding(false)
  }

  const scheduleRepeat = () => {
    repeatTimer.current = window.setTimeout(() => {
      repeatCount.current += 1
      suppressFlash.current = true
      run({ repeat: true }).finally(() => {
        suppressFlash.current = false
        if (repeatTimer.current) scheduleRepeat()
      })
    }, getRepeatDelay())
  }

  const startRepeat = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!repeat || disabled) return
    e.preventDefault()
    stopRepeat()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    repeatedPointer.current = true
    setHolding(true)
    run()
    scheduleRepeat()
  }

  useEffect(() => {
    if (!holding) return undefined
    const handlePointerUp = () => stopRepeat()
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('blur', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', handlePointerUp)
    }
  }, [holding])

  const handleClick = async () => {
    if (repeat && repeatedPointer.current) {
      repeatedPointer.current = false
      return
    }
    await run()
  }

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={handleClick}
      onPointerDown={repeat ? startRepeat : undefined}
      onPointerUp={repeat ? stopRepeat : undefined}
      onPointerLeave={repeat ? stopRepeat : undefined}
      onPointerCancel={repeat ? stopRepeat : undefined}
      onLostPointerCapture={repeat ? stopRepeat : undefined}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={SPRING}
      className={`flex items-center justify-center border border-denon-border/70 bg-denon-surface/70 text-denon-text transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
        holding || (feedbackState || feedback) === 'ok'
          ? 'ring-2 ring-denon-green/70 bg-denon-green/15'
          : (feedbackState || feedback) === 'fail'
            ? 'ring-2 ring-denon-red/80 bg-denon-red/15'
            : ''
      } ${className}`}
    >
      {children}
    </motion.button>
  )
}

interface RemoteIconProps {
  type: string
  className?: string
}

function RemoteIcon({ type, className = 'w-6 h-6' }: RemoteIconProps) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'power': return <svg {...common}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>
    case 'home': return <svg {...common}><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
    case 'back': return <svg {...common}><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
    case 'menu': return <svg {...common}><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>
    case 'mute': return <svg {...common}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>
    case 'playPause': return <svg {...common}><path d="m8 5 10 7-10 7z"/><path d="M19 5v14"/></svg>
    case 'stop': return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
    case 'prev': return <svg {...common}><path d="m11 18-6-6 6-6v12z"/><path d="m19 18-6-6 6-6v12z"/></svg>
    case 'next': return <svg {...common}><path d="m13 6 6 6-6 6V6z"/><path d="m5 6 6 6-6 6V6z"/></svg>
    case 'up': return <svg {...common}><path d="m18 15-6-6-6 6"/></svg>
    case 'down': return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>
    case 'left': return <svg {...common}><path d="m15 18-6-6 6-6"/></svg>
    case 'right': return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>
    default: return null
  }
}

function vibrate() {
  try {
    navigator?.vibrate?.(12)
  } catch {
    // Optional browser capability.
  }
}

interface Props {
  state: ReceiverState
  activeAndroidPanel: string
  setActiveAndroidPanel: (panel: string) => void
}

export default function AndroidTvRemote({ state, activeAndroidPanel, setActiveAndroidPanel }: Props) {
  const tv = (state.android_tv || {}) as any
  const [manualIp, setManualIp] = useState(tv.host || '')
  const [pairCode, setPairCode] = useState('')
  const [text, setText] = useState('')
  const [devices, setDevices] = useState<{ name: string; ip: string }[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [powerConfirm, setPowerConfirm] = useState(false)
  const [powerCountdown, setPowerCountdown] = useState(10)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [cardExpanded, setCardExpanded] = useState(true)
  const [lastCommand, setLastCommand] = useState<{ label: string; latency: number; ok: boolean } | null>(null)

  // Auto collapse on first connect, auto expand on disconnect
  const hasConnectedOnce = useRef(false)
  useEffect(() => {
    if (tv.connected) {
      if (!hasConnectedOnce.current) {
        setCardExpanded(false)
        hasConnectedOnce.current = true
      }
    } else {
      setCardExpanded(true)
      hasConnectedOnce.current = false
    }
  }, [tv.connected])
  const [toast, setToast] = useState<string | null>(null)
  const [activeFeedback, setActiveFeedback] = useState<{ label: string; state: 'ok' | 'fail' } | null>(null)
  const [adbStatus, setAdbStatus] = useState<AndroidAdbState | null>(state.android_adb || null)
  const feedbackTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!powerConfirm) return undefined
    if (powerCountdown <= 0) {
      setPowerConfirm(false)
      sendKey(KEYS.power)
      return undefined
    }
    const timer = setTimeout(() => setPowerCountdown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [powerConfirm, powerCountdown])

  useEffect(() => {
    setAdbStatus(state.android_adb || null)
  }, [state.android_adb])

  const request = async (path: string, body?: any, method = 'POST', options: { trackBusy?: boolean } = {}) => {
    const trackBusy = options.trackBusy !== false
    if (trackBusy) setBusy(path)
    setError(null)
    try {
      const res = await fetch(`/api/v1/androidtv${path}`, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      return data
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      if (trackBusy) setBusy(null)
    }
  }

  const scan = async () => {
    setBusy('scan')
    setError(null)
    try {
      const res = await fetch('/api/v1/androidtv/discover')
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setDevices(data.devices || [])
      if ((data.devices || []).length === 0) setError('No Android TV devices found.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const connect = async (host = manualIp) => {
    const result = await request('/connect', { host })
    if (result?.error === 'Pairing required') {
      await startPairing(host)
    }
    return result
  }
  const startPairing = async (host = manualIp) => {
    setPairCode('')
    return request('/pair/start', { host })
  }
  const disconnect = async () => {
    const result = await request('/disconnect')
    if (result) {
      setManualIp('')
      setPairCode('')
      setDevices(null)
    }
  }
  const selectDevice = (device: { name: string; ip: string }) => {
    setManualIp(device.ip)
    connect(device.ip)
  }
  const finishPairing = () => request('/pair/finish', { code: pairCode.trim().toUpperCase() })
  const showCommandError = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2600)
  }
  const sendKey = async (key: string, label = key, options: { repeat?: boolean } = {}) => {
    const started = performance.now()
    const result = await request('/key', { key }, 'POST', { trackBusy: false })
    const latency = Math.max(1, Math.round(performance.now() - started))
    const ok = Boolean(result)
    setLastCommand({ label, latency, ok })
    if (!options.repeat) {
      setActiveFeedback({ label, state: ok ? 'ok' : 'fail' })
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
      feedbackTimer.current = window.setTimeout(() => setActiveFeedback(null), 180)
    }
    if (!ok) showCommandError(`${label} failed`)
    if (ok) vibrate()
    return ok
  }
  const sendText = async () => {
    const value = text.trim()
    if (!value) return
    const started = performance.now()
    const ok = await request('/text', { text: value }, 'POST', { trackBusy: false })
    const latency = Math.max(1, Math.round(performance.now() - started))
    setLastCommand({ label: 'Text input', latency, ok: Boolean(ok) })
    setActiveFeedback({ label: 'Text input', state: ok ? 'ok' : 'fail' })
    setTimeout(() => setActiveFeedback(null), 180)
    if (ok) vibrate()
    if (ok) setText('')
    else showCommandError('Text input failed')
    return Boolean(ok)
  }
  const startPowerConfirm = () => {
    setPowerCountdown(10)
    setPowerConfirm(true)
  }
  const cancelPowerConfirm = () => {
    setPowerConfirm(false)
    setPowerCountdown(10)
  }
  const confirmPowerNow = () => {
    setPowerConfirm(false)
    sendKey(KEYS.power, 'Power')
  }

  const connected = tv.connected
  const adb = (adbStatus || {}) as any
  const needsPairing = tv.pairing
  const statusLabel = connected ? `Remote ${tv.host || ''}` : tv.pairing ? 'Remote pairing' : tv.host ? 'Remote reconnecting...' : 'Remote disconnected'
  const statusClass = connected ? 'badge-green' : tv.pairing || tv.host ? 'badge-muted' : 'badge-red'
  const adbStatusLabel = adb.enabled === false ? 'ADB Disabled' : adb.connected ? 'ADB Connected' : adb.state ? `ADB ${adb.state}` : 'ADB Disconnected'
  const adbStatusClass = adb.connected ? 'badge-green' : adb.enabled === false || adb.state === 'unauthorized' ? 'badge-muted' : 'badge-red'
  const lastError = error || tv.error
  const fb = (label: string) => activeFeedback?.label === label ? activeFeedback.state : null

  useEffect(() => {
    if (!connected || powerConfirm) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return

      const shortcuts: Record<string, [string, string]> = {
        ArrowUp: [KEYS.up, 'Up'],
        ArrowDown: [KEYS.down, 'Down'],
        ArrowLeft: [KEYS.left, 'Left'],
        ArrowRight: [KEYS.right, 'Right'],
        Enter: [KEYS.ok, 'OK'],
        Escape: [KEYS.back, 'Back'],
        ' ': [KEYS.playPause, 'Play/Pause'],
        m: [KEYS.mute, 'Mute'],
        M: [KEYS.mute, 'Mute'],
        h: [KEYS.home, 'Home'],
        H: [KEYS.home, 'Home'],
        '+': [KEYS.volUp, 'Volume up'],
        '=': [KEYS.volUp, 'Volume up'],
        '-': [KEYS.volDown, 'Volume down'],
        _: [KEYS.volDown, 'Volume down'],
      }
      const shortcut = shortcuts[event.key]
      if (!shortcut) return
      event.preventDefault()
      sendKey(shortcut[0], shortcut[1])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connected, powerConfirm])

  return (
    <div className="space-y-4 fade-in">
      {/* Collapsible Status Bar */}
      {!cardExpanded ? (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-denon-border/30 bg-denon-card/30 backdrop-blur-sm">
          <span className="text-xs font-semibold text-denon-text">Android TV Info</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCardExpanded(true)}
              className={`${statusClass} cursor-pointer hover:brightness-110 flex items-center gap-1.5`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-denon-green' : 'bg-denon-red'}`} />
              Remote: {connected ? 'OK' : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveAndroidPanel('adb')
                setCardExpanded(true)
              }}
              className={`${adbStatusClass} cursor-pointer hover:brightness-110 flex items-center gap-1.5`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${adb.connected ? 'bg-denon-green' : 'bg-denon-red'}`} />
              ADB: {adb.connected ? 'OK' : 'Off'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold text-denon-text">Android TV</h2>
                {connected && (
                  <button
                    type="button"
                    onClick={() => setCardExpanded(false)}
                    className="text-denon-muted hover:text-denon-text transition-colors p-0.5 rounded"
                    title="Collapse settings"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
                  </button>
                )}
              </div>
              <p className="text-xs text-denon-muted mt-1">
                {tv.device_name || tv.device_info?.model || tv.host || 'Remote protocol v2'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {connected && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={disconnect}
                  className="text-xs font-medium text-denon-gold hover:text-denon-text disabled:opacity-40"
                >
                  Change device
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailsOpen(open => !open)}
                className={`${statusClass} cursor-pointer hover:brightness-110 flex items-center gap-1.5`}
              >
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-denon-green' : tv.pairing || tv.host ? 'bg-denon-muted' : 'bg-denon-red'}`} />
                {statusLabel}
                <svg className={`w-3 h-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setActiveAndroidPanel('adb')}
                className={`${adbStatusClass} cursor-pointer hover:brightness-110 flex items-center gap-1.5`}
              >
                <span className={`w-2 h-2 rounded-full ${adb.connected ? 'bg-denon-green' : 'bg-denon-red'}`} />
                {adbStatusLabel}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {detailsOpen && (
              <motion.div
                variants={fadeInUp}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={SPRING}
                className="mt-4 rounded-xl border border-denon-border/50 bg-denon-surface/40 p-3 text-xs space-y-1.5"
              >
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">Android TV</span>
                  <span className={connected ? 'text-denon-green' : tv.host ? 'text-denon-muted' : 'text-denon-red'}>{connected ? 'Connected' : tv.host ? 'Reconnecting...' : 'Disconnected'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">IP</span>
                  <span className="font-mono text-denon-text truncate">{tv.host || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">Device</span>
                  <span className="text-denon-text truncate">{tv.device_name || tv.device_info?.model || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">Last command</span>
                  <span className={lastCommand?.ok === false ? 'text-denon-red' : 'text-denon-text'}>{lastCommand?.label || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">Latency</span>
                  <span className="text-denon-text">{lastCommand?.latency ? `${lastCommand.latency} ms` : '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-denon-muted">Muted</span>
                  <span className={tv.muted ? 'text-denon-gold' : 'text-denon-text'}>{tv.muted === true ? 'Yes' : tv.muted === false ? 'No' : '-'}</span>
                </div>
                {lastError && (
                  <div className="flex justify-between gap-3">
                    <span className="text-denon-muted">Last error</span>
                    <span className="text-denon-red text-right">{lastError}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {!connected && (
            <div className="mt-5 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualIp}
                  onChange={e => setManualIp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && manualIp && connect()}
                  placeholder="192.168.1.120"
                  className="flex-1 bg-denon-surface border border-denon-border rounded-xl px-3 py-2 text-sm text-denon-text placeholder-denon-muted focus:outline-none focus:border-denon-gold/50"
                />
                <button className="btn-primary font-medium" disabled={!manualIp || busy !== null} onClick={() => connect()}>
                  {busy === '/connect' ? 'Connecting...' : 'Connect'}
                </button>
              </div>

              <div className="flex gap-2">
                <button className="btn-ghost flex-1 font-medium" disabled={busy === 'scan'} onClick={scan}>
                  {busy === 'scan' ? 'Scanning...' : 'Scan network'}
                </button>
                <button className="btn-ghost flex-1 font-medium" disabled={!manualIp || busy !== null} onClick={() => startPairing()}>
                  {busy === '/pair/start' ? 'Pairing...' : 'Start pairing'}
                </button>
              </div>

              {devices && devices.length > 0 && (
                <div className="space-y-2">
                  {devices.map(device => (
                    <button
                      key={device.ip}
                      type="button"
                      onClick={() => selectDevice(device)}
                      disabled={busy !== null}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-denon-surface border border-denon-border hover:border-denon-gold/50 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-denon-text">{device.name}</p>
                        <p className="text-xs text-denon-muted mt-0.5">{device.ip} / Select to connect</p>
                      </div>
                      <RemoteIcon type="right" className="w-4 h-4 text-denon-gold" />
                    </button>
                  ))}
                </div>
              )}

              {(tv.pairing || needsPairing) && (
                <div className="bg-denon-surface/70 border border-denon-border rounded-xl p-3 space-y-3">
                  <p className="text-xs text-denon-muted">Enter the pairing code shown on the TV.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pairCode}
                      onChange={e => setPairCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && pairCode.trim() && !busy && finishPairing()}
                      placeholder="Pairing code"
                      className="flex-1 bg-denon-dark border border-denon-border rounded-xl px-3 py-2 text-sm text-denon-text placeholder-denon-muted focus:outline-none focus:border-denon-gold/50"
                    />
                    <button className="btn-primary font-medium" disabled={!pairCode.trim() || busy !== null} onClick={finishPairing}>
                      {busy === '/pair/finish' ? 'Confirming...' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lastError && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
              {lastError}
            </div>
          )}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(360px,420px)_1fr] lg:items-start lg:gap-4">
        <div className={`${activeAndroidPanel === 'remote' ? '' : 'hidden'} lg:block`}>
          {connected && (
            <div className="card relative remote-card-layout">
              <div className="flex items-center justify-between gap-3">
                <IconButton label="Power" disabled={!connected} onClick={startPowerConfirm} feedbackState={fb('Power')} className="remote-row-btn w-16 rounded-xl bg-denon-red/80 border-denon-red/50 sm:w-24 sm:rounded-2xl">
                  <RemoteIcon type="power" className="w-5 h-5 sm:w-6 sm:h-6" />
                </IconButton>
                {adb.enabled !== false && (
                  <AndroidTvLiveView
                    adbConnected={Boolean(adb.connected)}
                    remoteConnected={connected}
                    onRemoteKey={sendKey}
                    variant="dialogButton"
                    defaultQuality="low"
                    defaultInterval="balanced"
                    className="remote-row-btn lg:hidden"
                  />
                )}
              </div>

              <div className="relative mx-auto dpad-container aspect-square">
                <div className="absolute inset-0 rounded-full bg-denon-surface border border-denon-border shadow-inner" />
                <IconButton label="Up" disabled={!connected} repeat feedbackState={fb('Up')} onClick={(meta) => sendKey(KEYS.up, 'Up', meta)} className="absolute left-1/2 dpad-btn-up -translate-x-1/2 rounded-3xl border-transparent bg-transparent"><RemoteIcon type="up" className="w-8 h-8 sm:w-10 sm:h-10" /></IconButton>
                <IconButton label="Down" disabled={!connected} repeat feedbackState={fb('Down')} onClick={(meta) => sendKey(KEYS.down, 'Down', meta)} className="absolute left-1/2 dpad-btn-down -translate-x-1/2 rounded-3xl border-transparent bg-transparent"><RemoteIcon type="down" className="w-8 h-8 sm:w-10 sm:h-10" /></IconButton>
                <IconButton label="Left" disabled={!connected} repeat feedbackState={fb('Left')} onClick={(meta) => sendKey(KEYS.left, 'Left', meta)} className="absolute top-1/2 dpad-btn-left -translate-y-1/2 rounded-3xl border-transparent bg-transparent"><RemoteIcon type="left" className="w-8 h-8 sm:w-10 sm:h-10" /></IconButton>
                <IconButton label="Right" disabled={!connected} repeat feedbackState={fb('Right')} onClick={(meta) => sendKey(KEYS.right, 'Right', meta)} className="absolute top-1/2 dpad-btn-right -translate-y-1/2 rounded-3xl border-transparent bg-transparent"><RemoteIcon type="right" className="w-8 h-8 sm:w-10 sm:h-10" /></IconButton>
                <IconButton label="OK" disabled={!connected} feedbackState={fb('OK')} onClick={() => sendKey(KEYS.ok, 'OK')} className="absolute left-1/2 top-1/2 dpad-btn-ok -translate-x-1/2 -translate-y-1/2 rounded-full bg-denon-card border-denon-border font-light">
                  OK
                </IconButton>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <IconButton label="Back" disabled={!connected} feedbackState={fb('Back')} onClick={() => sendKey(KEYS.back, 'Back')} className="remote-row-btn rounded-xl sm:rounded-2xl"><RemoteIcon type="back" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
                <IconButton label="Home" disabled={!connected} feedbackState={fb('Home')} onClick={() => sendKey(KEYS.home, 'Home')} className="remote-row-btn rounded-xl sm:rounded-2xl"><RemoteIcon type="home" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
                <IconButton label="Menu" disabled={!connected} feedbackState={fb('Menu')} onClick={() => sendKey(KEYS.menu, 'Menu')} className="remote-row-btn rounded-xl sm:rounded-2xl"><RemoteIcon type="menu" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
              </div>

              <div className="grid grid-cols-3 gap-4 items-center">
                <div className="remote-knob rounded-full bg-denon-surface border border-denon-border overflow-hidden grid grid-rows-3">
                  <IconButton label="Volume up" disabled={!connected} repeat feedbackState={fb('Volume up')} onClick={(meta) => sendKey(KEYS.volUp, 'Volume up', meta)} className="rounded-none border-0 bg-transparent text-2xl sm:text-4xl">+</IconButton>
                  <div className="flex items-center justify-center text-denon-text text-sm sm:text-lg select-none">VOL</div>
                  <IconButton label="Volume down" disabled={!connected} repeat feedbackState={fb('Volume down')} onClick={(meta) => sendKey(KEYS.volDown, 'Volume down', meta)} className="rounded-none border-0 bg-transparent text-2xl sm:text-4xl">-</IconButton>
                </div>
                <div className="space-y-2 sm:space-y-3">
                  <IconButton
                    label={tv.muted ? 'Mute on' : 'Mute'}
                    disabled={!connected}
                    feedbackState={fb('Mute')}
                    onClick={() => sendKey(KEYS.mute, 'Mute')}
                    className={`w-full remote-row-btn rounded-xl sm:rounded-2xl gap-2 ${tv.muted ? 'border-denon-gold bg-denon-gold/25 text-denon-gold shadow-lg shadow-denon-gold/15' : ''}`}
                  >
                    <RemoteIcon type="mute" className="w-5 h-5 sm:w-6 sm:h-6" />
                    {tv.muted && <span className="text-[10px] sm:text-xs font-bold tracking-wide">MUTED</span>}
                  </IconButton>
                  <IconButton label="Sleep" disabled={!connected} feedbackState={fb('Sleep')} onClick={() => sendKey(KEYS.sleep, 'Sleep')} className="w-full remote-row-btn rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold">SLEEP</IconButton>
                </div>
                <div className="remote-knob rounded-full bg-denon-surface border border-denon-border overflow-hidden grid grid-rows-3">
                  <IconButton label="Channel up" disabled={!connected} repeat feedbackState={fb('Channel up')} onClick={(meta) => sendKey(KEYS.chUp, 'Channel up', meta)} className="rounded-none border-0 bg-transparent text-2xl sm:text-4xl">+</IconButton>
                  <div className="flex items-center justify-center text-denon-text text-sm sm:text-lg select-none">CH</div>
                  <IconButton label="Channel down" disabled={!connected} repeat feedbackState={fb('Channel down')} onClick={(meta) => sendKey(KEYS.chDown, 'Channel down', meta)} className="rounded-none border-0 bg-transparent text-2xl sm:text-4xl">-</IconButton>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <IconButton label="Previous" disabled={!connected} repeat feedbackState={fb('Previous')} onClick={(meta) => sendKey(KEYS.prev, 'Previous', meta)} className="remote-media-btn rounded-full"><RemoteIcon type="prev" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
                <IconButton label="Stop" disabled={!connected} feedbackState={fb('Stop')} onClick={() => sendKey(KEYS.stop, 'Stop')} className="remote-media-btn rounded-full"><RemoteIcon type="stop" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
                <IconButton label="Play/Pause" disabled={!connected} feedbackState={fb('Play/Pause')} onClick={() => sendKey(KEYS.playPause, 'Play/Pause')} className="remote-media-btn rounded-full"><RemoteIcon type="playPause" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
                <IconButton label="Next" disabled={!connected} repeat feedbackState={fb('Next')} onClick={(meta) => sendKey(KEYS.next, 'Next', meta)} className="remote-media-btn rounded-full"><RemoteIcon type="next" className="w-5 h-5 sm:w-6 sm:h-6" /></IconButton>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendText()}
                  placeholder="Send text to Android TV"
                  disabled={!connected}
                  className="flex-1 bg-denon-surface border border-denon-border rounded-xl px-3 py-2 text-sm text-denon-text placeholder-denon-muted focus:outline-none focus:border-denon-gold/50 disabled:opacity-40 remote-text-input"
                />
                <button className="btn-primary font-medium remote-row-btn px-4 rounded-xl" disabled={!connected || !text.trim() || busy !== null} onClick={sendText}>
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`${activeAndroidPanel === 'remote' ? 'hidden' : ''} lg:block`}>
          <div className="lg:hidden">
            {activeAndroidPanel === 'screen' && <AndroidTvAdbPanel tv={tv} adbStatus={adbStatus} mode="screen" showHeader={false} onRemoteKey={sendKey} onStatusChange={setAdbStatus} />}
            {activeAndroidPanel === 'apps' && <AndroidTvAdbPanel tv={tv} adbStatus={adbStatus} mode="apps" showHeader={false} onRemoteKey={sendKey} onStatusChange={setAdbStatus} />}
            {activeAndroidPanel === 'adb' && <AndroidTvAdbPanel tv={tv} adbStatus={adbStatus} mode="adb" onRemoteKey={sendKey} onStatusChange={setAdbStatus} />}
          </div>
          <div className="hidden lg:block">
            <AndroidTvAdbPanel tv={tv} adbStatus={adbStatus} mode="all" onRemoteKey={sendKey} onStatusChange={setAdbStatus} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {powerConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <motion.div
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={SPRING}
              className="w-full max-w-sm rounded-2xl border border-denon-border bg-denon-card p-5 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-denon-red/50 bg-denon-red/15 text-denon-red">
                  <RemoteIcon type="power" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-denon-text">Power off Android TV</h3>
                  <p className="text-xs text-denon-muted mt-0.5">Power command will be sent in {powerCountdown}s.</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" className="btn-ghost font-medium" onClick={cancelPowerConfirm}>
                  Cancel
                </button>
                <button type="button" className="btn-danger font-medium" onClick={confirmPowerNow}>
                  Power off now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-denon-red/40 bg-denon-red/15 px-4 py-2 text-sm font-medium text-red-200 shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
