import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ModalShell from './ModalShell'
import SegmentedControl, { type SegmentOption } from './SegmentedControl'
import { formatTimeLabel, parseTimeInput, resolveTimeFormat } from '../utils/timeFormat'
import { orderChannels } from '../utils/channels'
import { TRIM, formatDb } from '../protocol'
import type {
  ApiResponse, DeviceInfo, NightModeConfig, NightModeKind as NightMode, NightModeSchedule, PostFn, ReceiverState,
} from '../types'

export type NightModeConfigChange = (config: NightModeConfig) => Promise<ApiResponse>

interface Props {
  open: boolean
  onClose: () => void
  state: ReceiverState | null | undefined
  info: DeviceInfo | null | undefined
  post: PostFn
  onConfigChange?: NightModeConfigChange
}

const EMPTY_LEVELS: Record<string, number> = {}
const EMPTY_NAMES: Record<string, string> = {}
// Offsets may move a channel across the whole trim range in either direction.
const OFFSET_RANGE = TRIM.max - TRIM.min
const DEFAULT_START = '22:00'
const DEFAULT_END = '02:00'

const MODE_OPTIONS: SegmentOption<NightMode>[] = [
  { value: 'offset', label: 'Offset (recommended)' },
  { value: 'absolute', label: 'Absolute' },
]

const DAYS: [string, string][] = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function defaultConfig(info: DeviceInfo | null | undefined): NightModeConfig {
  const saved = info?.night_mode_config
  return {
    mode: saved?.mode === 'absolute' ? 'absolute' : 'offset',
    channels: saved?.channels ?? [],
    schedule: {
      enabled: false,
      days: [],
      start: DEFAULT_START,
      end: DEFAULT_END,
      timezone: info?.time_settings?.timezone || 'Europe/Berlin',
      ...(saved?.schedule ?? {}),
    },
  }
}

function trimLabel(value: number): string {
  return `${formatDb(value, TRIM.zeroDb)} dB`
}

export default function NightModeModal({ open, onClose, state, info, post, onConfigChange }: Props) {
  const channelVolumes = state?.channel_volumes ?? EMPTY_LEVELS
  const channelNames = info?.channel_names ?? EMPTY_NAMES
  // Keyed on the channel set, not the levels: a trim push must not re-sort.
  const channelKey = Object.keys(channelVolumes).join('|')
  const channelCodes = useMemo(() => orderChannels(
    Object.fromEntries((channelKey ? channelKey.split('|') : []).map(c => [c, true])),
    channelNames,
  ), [channelKey, channelNames])

  const [mode, setMode] = useState<NightMode>('offset')
  const [schedule, setSchedule] = useState<NightModeSchedule>(() => defaultConfig(info).schedule)
  // What the time inputs show while typing; parsed into `schedule` on blur.
  const [startDraft, setStartDraft] = useState('')
  const [endDraft, setEndDraft] = useState('')
  const [channels, setChannels] = useState<Record<string, { value: number }>>({})
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [message, setMessage] = useState('')
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timezone = info?.time_settings?.timezone || schedule.timezone || 'Europe/Berlin'
  const timeFormat = resolveTimeFormat(info?.time_settings?.time_format, timezone)

  const flash = useCallback((text: string, ms: number) => {
    if (messageTimer.current) clearTimeout(messageTimer.current)
    setMessage(text)
    messageTimer.current = setTimeout(() => {
      messageTimer.current = null
      setMessage('')
    }, ms)
  }, [])

  useEffect(() => () => {
    if (messageTimer.current) clearTimeout(messageTimer.current)
  }, [])

  const applySchedule = (next: NightModeSchedule) => {
    setSchedule(next)
    setStartDraft(formatTimeLabel(next.start, timeFormat))
    setEndDraft(formatTimeLabel(next.end, timeFormat))
  }

  // Load the saved preset when the modal opens (not on every state push, which
  // would discard the user's edits). The ref carries the latest render's values.
  const loadRef = useRef<() => void>(() => {})
  loadRef.current = () => {
    const cfg = defaultConfig(info)
    setMode(cfg.mode)
    applySchedule(cfg.schedule)
    const mapped: Record<string, { value: number }> = {}
    for (const ch of cfg.channels) {
      if (!channelCodes.includes(ch.channel)) continue
      mapped[ch.channel] = {
        value: Number.isFinite(Number(ch.value)) ? Number(ch.value) : (cfg.mode === 'offset' ? -4 : channelVolumes[ch.channel] ?? TRIM.zeroDb),
      }
    }
    setChannels(mapped)
    if (messageTimer.current) clearTimeout(messageTimer.current)
    setMessage('')
  }
  useEffect(() => {
    if (open) loadRef.current()
  }, [open])

  if (!open) return null

  const selectedChannels = Object.keys(channels)
  const configPayload = (): NightModeConfig => ({
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
      else next[channel] = { value: mode === 'offset' ? -4 : channelVolumes[channel] ?? TRIM.zeroDb }
      return next
    })
  }

  const changeMode = (nextMode: NightMode) => {
    setMode(nextMode)
    setChannels(prev => Object.fromEntries(Object.entries(prev).map(([ch, cfg]) => [
      ch,
      { value: nextMode === 'offset' ? (mode === 'offset' ? cfg.value : -4) : clamp((channelVolumes[ch] ?? TRIM.zeroDb) + (mode === 'offset' ? cfg.value : 0), TRIM.min, TRIM.max) },
    ])))
  }

  const save = async () => {
    setSaving(true)
    let res: ApiResponse | undefined
    try {
      res = await onConfigChange?.(configPayload())
    } catch {
      res = undefined
    } finally {
      setSaving(false)
    }
    if (res?.ok) flash('Settings saved', 2000)
    else flash('Save failed', 3000)
  }

  const applyNow = async () => {
    const payload = configPayload()
    if (!state?.night_mode_enabled && payload.channels.length === 0) {
      flash('Select at least one speaker', 2500)
      return
    }
    setApplying(true)
    const res = await post('/night-mode', {
      enabled: !state?.night_mode_enabled,
      channels: state?.night_mode_enabled ? [] : payload.channels,
    })
    setApplying(false)
    if (!res.ok) {
      flash(res.status === 503 ? 'Receiver not available' : 'Night Mode failed', 3000)
    }
  }

  const commitTime = (field: 'start' | 'end', draft: string) => {
    const parsed = parseTimeInput(draft, schedule[field] || (field === 'start' ? DEFAULT_START : DEFAULT_END))
    setSchedule(prev => ({ ...prev, [field]: parsed }))
    const label = formatTimeLabel(parsed, timeFormat)
    if (field === 'start') setStartDraft(label)
    else setEndDraft(label)
  }

  const footer = (
    <>
      <button onClick={applyNow} disabled={applying || !state?.connected} className={`btn-ghost text-sm ${state?.night_mode_enabled ? 'text-denon-gold' : ''}`}>
        {applying ? 'Applying…' : state?.night_mode_enabled ? 'Disable Now' : 'Enable Now'}
      </button>
      <div className="flex gap-2">
        <button onClick={() => { setChannels({}); applySchedule(defaultConfig(info).schedule); setMode('offset') }} className="btn-ghost text-sm">Reset</button>
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving…' : 'Save Settings'}</button>
      </div>
    </>
  )

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      modalId="night-mode"
      title="🌙 Night Mode"
      subtitle="Recommended: Offset mode lowers selected speakers relative to their current trim."
      closeLabel="Close Night Mode"
      footer={footer}
    >
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {message && <div className="text-xs text-denon-gold bg-denon-gold/10 border border-denon-gold/20 rounded-xl px-3 py-2">{message}</div>}

          <div className="card !p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Schedule</h3>
              <button
                onClick={() => setSchedule(prev => ({ ...prev, enabled: !prev.enabled }))}
                aria-pressed={schedule.enabled}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${schedule.enabled ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface text-denon-muted'}`}
              >
                {schedule.enabled ? 'Schedule On' : 'Schedule Off'}
              </button>
            </div>
            <p className="text-xs text-denon-muted mb-2">Which days Night Mode should be activated:</p>
            <div className="grid grid-cols-7 gap-1.5 mb-3">
              {DAYS.map(([key, label]) => (
                <button key={key} onClick={() => toggleDay(key)} aria-pressed={schedule.days.includes(key)} className={`py-2 rounded-lg text-xs font-semibold ${schedule.days.includes(key) ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40' : 'bg-denon-surface/70 text-denon-muted hover:text-denon-text'}`}>
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
                  value={startDraft}
                  onChange={e => setStartDraft(e.target.value)}
                  onBlur={e => commitTime('start', e.target.value)}
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
                  value={endDraft}
                  onChange={e => setEndDraft(e.target.value)}
                  onBlur={e => commitTime('end', e.target.value)}
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
              <button onClick={() => setShowHelp(v => !v)} aria-label="Explain adjustment modes" aria-expanded={showHelp} className="w-5 h-5 rounded-full bg-denon-surface text-denon-muted hover:text-denon-text text-[10px] font-bold">i</button>
            </div>
            {showHelp && (
              <p className="text-xs text-denon-muted mb-3 bg-denon-surface/50 rounded-xl p-3">
                Offset is recommended: it subtracts from the current receiver trim when enabled, e.g. current 50 plus -4 becomes 46. Absolute sets an exact receiver trim value from 38-62 where 50 is 0 dB.
              </p>
            )}
            <SegmentedControl
              label="Adjustment mode"
              grow
              variant="soft"
              size="md"
              options={MODE_OPTIONS}
              value={mode}
              onChange={changeMode}
            />
          </div>

          <div className="card !p-4">
            <h3 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-3">Speakers</h3>
            <div className="space-y-3">
              {channelCodes.map(ch => {
                const selected = Boolean(channels[ch])
                const label = info?.channel_names?.[ch] || ch
                const value = channels[ch]?.value ?? (mode === 'offset' ? -4 : channelVolumes[ch] ?? TRIM.zeroDb)
                const preview = mode === 'offset' ? clamp((channelVolumes[ch] ?? TRIM.zeroDb) + value, TRIM.min, TRIM.max) : value
                return (
                  <div key={ch} className="rounded-xl bg-denon-surface/40 p-2">
                    <button onClick={() => toggleChannel(ch)} aria-pressed={selected} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${selected ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/30' : 'bg-denon-surface/70 text-denon-text'}`}>
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
                          min={mode === 'offset' ? -OFFSET_RANGE : TRIM.min}
                          max={mode === 'offset' ? OFFSET_RANGE : TRIM.max}
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
    </ModalShell>
  )
}
