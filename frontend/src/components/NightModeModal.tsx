import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatTimeInput, formatTimeLabel, parseTimeInput, resolveTimeFormat } from '../utils/timeFormat'
import type { ReceiverState, DeviceInfo, PostFn } from '../types'

type NightMode = 'offset' | 'absolute'

export interface NightModeChannelConfig {
  channel: string
  mode: NightMode
  value: number
}

interface NightModeSchedule {
  enabled: boolean
  days: string[]
  start: string
  end: string
  timezone: string
}

export interface NightModeConfigState {
  mode: NightMode
  channels: NightModeChannelConfig[]
  schedule: NightModeSchedule
}

interface Props {
  open: boolean
  onClose: () => void
  state: ReceiverState | null | undefined
  info: DeviceInfo | null | undefined
  post: PostFn
  onConfigChange?: (config: NightModeConfigState) => void | Promise<void>
}

const DAYS: [string, string][] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]
const CHANNEL_ORDER = ['FL', 'FR', 'C', 'SW', 'SW2', 'SL', 'SR', 'SBL', 'SBR', 'SB',
  'FHL', 'FHR', 'FWL', 'FWR', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function defaultConfig(info: DeviceInfo | null | undefined): NightModeConfigState {
  const saved = (info?.night_mode_config || {}) as {
    mode?: string
    channels?: NightModeChannelConfig[]
    schedule?: Partial<NightModeSchedule>
  }
  return {
    mode: saved.mode === 'absolute' ? 'absolute' : 'offset',
    channels: saved.channels || [],
    schedule: {
      enabled: false,
      days: [],
      start: '22:00',
      end: '02:00',
      timezone: info?.time_settings?.timezone || 'Europe/Berlin',
      ...(saved.schedule || {}),
    },
  }
}

function trimLabel(value: number): string {
  const db = value - 50
  if (db === 0) return '0 dB'
  return `${db > 0 ? '+' : ''}${db} dB`
}

export default function NightModeModal({ open, onClose, state, info, post, onConfigChange }: Props) {
  const channelVolumes: Record<string, number> = state?.channel_volumes || {}
  const channelCodes = useMemo(() => Object.keys(channelVolumes).sort((a, b) => {
    const ai = CHANNEL_ORDER.indexOf(a)
    const bi = CHANNEL_ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  }), [channelVolumes])

  const [mode, setMode] = useState<NightMode>('offset')
  const [schedule, setSchedule] = useState<NightModeSchedule>(defaultConfig(info).schedule)
  const [channels, setChannels] = useState<Record<string, { value: number }>>({})
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [message, setMessage] = useState('')
  const timezone = info?.time_settings?.timezone || schedule.timezone || 'Europe/Berlin'
  const timeFormat = resolveTimeFormat(info?.time_settings?.time_format, timezone)

  useEffect(() => {
    if (!open) return
    const cfg = defaultConfig(info)
    const globalMode: NightMode = cfg.mode === 'absolute' ? 'absolute' : 'offset'
    setMode(globalMode)
    setSchedule(cfg.schedule)
    const mapped: Record<string, { value: number }> = {}
    for (const ch of cfg.channels || []) {
      if (!channelCodes.includes(ch.channel)) continue
      mapped[ch.channel] = {
        value: Number.isFinite(Number(ch.value)) ? Number(ch.value) : (globalMode === 'offset' ? -4 : channelVolumes[ch.channel] ?? 50),
      }
    }
    setChannels(mapped)
    setMessage('')
  }, [open, info?.night_mode_config, channelCodes.join('|')])

  if (!open) return null

  const selectedChannels = Object.keys(channels)
  const configPayload = (): NightModeConfigState => ({
    mode,
    schedule,
    channels: selectedChannels.map(channel => ({
      channel,
      mode,
      value: channels[channel].value,
    })),
  })

  const toggleDay = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day],
    }))
  }

  const toggleChannel = (channel: string) => {
    setChannels(prev => {
      const next = { ...prev }
      if (next[channel]) delete next[channel]
      else next[channel] = { value: mode === 'offset' ? -4 : channelVolumes[channel] ?? 50 }
      return next
    })
  }

  const changeMode = (nextMode: NightMode) => {
    setMode(nextMode)
    setChannels(prev => Object.fromEntries(Object.entries(prev).map(([ch, cfg]) => [
      ch,
      { value: nextMode === 'offset' ? (mode === 'offset' ? cfg.value : -4) : clamp((channelVolumes[ch] ?? 50) + (mode === 'offset' ? cfg.value : 0), 38, 62) },
    ])))
  }

  const save = async () => {
    setSaving(true)
    await onConfigChange?.(configPayload())
    setSaving(false)
    setMessage('Settings saved')
    setTimeout(() => setMessage(''), 2000)
  }

  const applyNow = async () => {
    const payload = configPayload()
    if (!state?.night_mode_enabled && payload.channels.length === 0) {
      setMessage('Select at least one speaker')
      setTimeout(() => setMessage(''), 2500)
      return
    }
    setApplying(true)
    const res = await post('/night-mode', {
      enabled: !state?.night_mode_enabled,
      channels: state?.night_mode_enabled ? [] : payload.channels,
    })
    setApplying(false)
    if (!res.ok) {
      setMessage(res.status === 503 ? 'Receiver not available' : 'Night Mode failed')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/70 z-50 transition-opacity duration-200" onClick={onClose} />
      <div data-modal="night-mode" className="fixed inset-2 sm:inset-auto sm:top-4 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl
        bg-denon-dark rounded-2xl z-50 flex flex-col overflow-hidden border border-denon-gold/40 shadow-2xl shadow-black/50 fade-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-denon-border/30 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-denon-text">🌙 Night Mode</h2>
            <p className="text-[10px] text-denon-muted">Recommended: Offset mode lowers selected speakers relative to their current trim.</p>
          </div>
          <button onClick={onClose} className="text-denon-muted hover:text-denon-text transition-colors p-1" aria-label="Close Night Mode">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {message && <div className="text-xs text-denon-gold bg-denon-gold/10 border border-denon-gold/20 rounded-xl px-3 py-2">{message}</div>}

          <div className="card !p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Schedule</h3>
              <button
                onClick={() => setSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${schedule.enabled ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface text-denon-muted'}`}
              >
                {schedule.enabled ? 'Schedule On' : 'Schedule Off'}
              </button>
            </div>
            <p className="text-xs text-denon-muted mb-2">Which days Night Mode should be activated:</p>
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {DAYS.map(([key, label]) => (
                <button key={key} onClick={() => toggleDay(key)} className={`py-2 rounded-lg text-xs font-semibold ${schedule.days.includes(key) ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface/70 text-denon-muted hover:text-denon-text'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-denon-muted">From
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-2]?[0-9]:[0-5][0-9]"
                  placeholder={timeFormat === '12h' ? '10:00 PM' : '22:00'}
                  value={formatTimeInput(schedule.start, timeFormat)}
                  onChange={e => setSchedule(prev => ({ ...prev, start: e.target.value }))}
                  onFocus={e => { e.target.value = schedule.start }}
                  onBlur={e => setSchedule(prev => ({ ...prev, start: parseTimeInput(e.target.value, '22:00') }))}
                  className="mt-1 w-full bg-denon-surface border border-denon-border/50 rounded-xl px-3 py-2 text-denon-text font-mono"
                />
                <span className="block text-[10px] text-denon-muted/70 mt-1">{formatTimeLabel(schedule.start, timeFormat)}</span>
              </label>
              <label className="text-xs text-denon-muted">To
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-2]?[0-9]:[0-5][0-9]"
                  placeholder={timeFormat === '12h' ? '2:00 AM' : '02:00'}
                  value={formatTimeInput(schedule.end, timeFormat)}
                  onChange={e => setSchedule(prev => ({ ...prev, end: e.target.value }))}
                  onFocus={e => { e.target.value = schedule.end }}
                  onBlur={e => setSchedule(prev => ({ ...prev, end: parseTimeInput(e.target.value, '02:00') }))}
                  className="mt-1 w-full bg-denon-surface border border-denon-border/50 rounded-xl px-3 py-2 text-denon-text font-mono"
                />
                <span className="block text-[10px] text-denon-muted/70 mt-1">{formatTimeLabel(schedule.end, timeFormat)}</span>
              </label>
            </div>
            <p className="text-[10px] text-denon-muted/70 mt-2">Timezone: {timezone}. Display: {timeFormat}. Cross-midnight ranges like {formatTimeLabel('22:00', timeFormat)} → {formatTimeLabel('02:00', timeFormat)} are supported.</p>
          </div>

          <div className="card !p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Adjustment Mode</h3>
              <button onClick={() => setShowHelp(v => !v)} className="w-5 h-5 rounded-full bg-denon-surface text-denon-muted hover:text-denon-text text-[10px] font-bold">i</button>
            </div>
            {showHelp && (
              <p className="text-xs text-denon-muted mb-3 bg-denon-surface/50 rounded-xl p-3">
                Offset is recommended: it subtracts from the current receiver trim when enabled, e.g. current 50 plus -4 becomes 46. Absolute sets an exact receiver trim value from 38-62 where 50 is 0 dB.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(['offset', 'absolute'] as NightMode[]).map(m => (
                <button key={m} onClick={() => changeMode(m)} className={`py-3 rounded-xl text-sm font-semibold capitalize ${mode === m ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface/70 text-denon-muted hover:text-denon-text'}`}>
                  {m}{m === 'offset' ? ' (recommended)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="card !p-4">
            <h3 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-3">Speakers</h3>
            <div className="space-y-3">
              {channelCodes.map(ch => {
                const selected = Boolean(channels[ch])
                const label = info?.channel_names?.[ch] || ch
                const value = channels[ch]?.value ?? (mode === 'offset' ? -4 : channelVolumes[ch] ?? 50)
                const preview = mode === 'offset' ? clamp((channelVolumes[ch] ?? 50) + value, 38, 62) : value
                return (
                  <div key={ch} className="rounded-xl bg-denon-surface/40 p-2">
                    <button onClick={() => toggleChannel(ch)} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${selected ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/30' : 'bg-denon-surface/70 text-denon-text'}`}>
                      {label}
                    </button>
                    {selected && (
                      <div className="pt-3 px-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-denon-muted">{mode === 'offset' ? `Offset ${value}` : `Level ${value}`}</span>
                          <span className="text-denon-text tabular-nums">Preview: {preview} ({trimLabel(preview)})</span>
                        </div>
                        <input
                          type="range"
                          aria-label={`${label} night mode ${mode}`}
                          min={mode === 'offset' ? -24 : 38}
                          max={mode === 'offset' ? 24 : 62}
                          step={1}
                          value={value}
                          onChange={e => setChannels(prev => ({ ...prev, [ch]: { value: parseInt(e.target.value, 10) } }))}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-denon-border/30 flex items-center justify-between gap-2 shrink-0">
          <button onClick={applyNow} disabled={applying || !state?.connected} className={`btn-ghost text-sm ${state?.night_mode_enabled ? 'text-denon-gold' : ''}`}>
            {applying ? 'Applying…' : state?.night_mode_enabled ? 'Disable Now' : 'Enable Now'}
          </button>
          <div className="flex gap-2">
            <button onClick={() => { setChannels({}); setSchedule(defaultConfig(info).schedule); setMode('offset') }} className="btn-ghost text-sm">Reset</button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save Settings'}</button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
