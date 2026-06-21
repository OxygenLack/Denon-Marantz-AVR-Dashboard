import { useEffect, useMemo, useState } from 'react'

const CHANNEL_ORDER = ['FL', 'FR', 'C', 'SW', 'SW2', 'SL', 'SR', 'SBL', 'SBR', 'SB',
  'FHL', 'FHR', 'FWL', 'FWR', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function loadConfigFromInfo(info, validChannels) {
  const configured = info?.night_mode_config?.channels || []
  const channels = {}
  for (const cfg of configured) {
    const ch = cfg.channel
    if (!validChannels.includes(ch)) continue
    channels[ch] = {
      mode: cfg.mode === 'offset' ? 'offset' : 'absolute',
      value: Number.isFinite(Number(cfg.value)) ? Number(cfg.value) : 50,
    }
  }
  return { channels }
}

export default function NightModePanel({ state, post, info, onNightModeConfigChange }) {
  const channelVolumes = state?.channel_volumes || {}
  const channelCodes = useMemo(() => Object.keys(channelVolumes).sort((a, b) => {
    const ai = CHANNEL_ORDER.indexOf(a)
    const bi = CHANNEL_ORDER.indexOf(b)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  }), [channelVolumes])

  const [config, setConfig] = useState({ channels: {} })
  const [selected, setSelected] = useState({})
  const [applying, setApplying] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loaded = loadConfigFromInfo(info, channelCodes)
    setConfig(loaded)
    setSelected(Object.fromEntries(Object.keys(loaded.channels).map(ch => [ch, true])))
  }, [channelCodes.join('|'), JSON.stringify(info?.night_mode_config || {})])

  const updateChannel = (ch, patch) => {
    setConfig(prev => ({
      channels: {
        ...prev.channels,
        [ch]: {
          mode: 'offset',
          value: -4,
          ...prev.channels[ch],
          ...patch,
        },
      },
    }))
  }

  const toggleChannel = (ch, checked) => {
    setSelected(prev => ({ ...prev, [ch]: checked }))
    if (checked && !config.channels[ch]) {
      updateChannel(ch, { mode: 'offset', value: -4 })
    }
  }

  const savePreset = async () => {
    const filtered = { channels: {} }
    for (const ch of channelCodes) {
      if (selected[ch] && config.channels[ch]) filtered.channels[ch] = config.channels[ch]
    }
    setConfig(filtered)
    setSelected(Object.fromEntries(Object.keys(filtered.channels).map(ch => [ch, true])))
    await onNightModeConfigChange?.(Object.entries(filtered.channels).map(([channel, cfg]) => ({ channel, ...cfg })))
    setMessage('Settings saved')
    setTimeout(() => setMessage(''), 2000)
  }

  const resetAll = async () => {
    setConfig({ channels: {} })
    setSelected({})
    await onNightModeConfigChange?.([])
    setMessage('Settings cleared')
    setTimeout(() => setMessage(''), 2000)
  }

  const applyNightMode = async () => {
    if (!state?.connected) {
      setMessage('Receiver not available')
      setTimeout(() => setMessage(''), 2500)
      return
    }

    const enabled = !state?.night_mode_enabled
    const channels = enabled
      ? channelCodes
          .filter(ch => selected[ch] && config.channels[ch])
          .map(ch => {
            const cfg = config.channels[ch]
            const rawValue = parseInt(cfg.value, 10)
            let value = Number.isFinite(rawValue) ? rawValue : (cfg.mode === 'offset' ? 0 : 50)
            if (cfg.mode === 'offset') {
              const computed = (channelVolumes[ch] ?? 50) + value
              const clamped = clamp(computed, 38, 62)
              if (computed !== clamped) console.warn(`Night mode ${ch} offset clamped from ${computed} to ${clamped}`)
            } else {
              const clamped = clamp(value, 38, 62)
              if (value !== clamped) console.warn(`Night mode ${ch} absolute value clamped from ${value} to ${clamped}`)
              value = clamped
            }
            return { channel: ch, mode: cfg.mode, value }
          })
      : []

    if (enabled && channels.length === 0) {
      setMessage('Select at least one channel')
      setTimeout(() => setMessage(''), 2500)
      return
    }

    setApplying(true)
    const result = await post('/night-mode', { enabled, channels })
    setApplying(false)
    if (!result.ok) {
      setMessage(result.status === 503 ? 'Receiver not available' : 'Night mode failed')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  if (channelCodes.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-3">Night Mode</h2>
        <p className="text-xs text-denon-muted/60">Turn on the receiver to configure night mode.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Night Mode</h2>
          {message && <p className="text-[10px] text-denon-gold mt-1">{message}</p>}
        </div>
        <button
          onClick={applyNightMode}
          disabled={applying || !state?.connected}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            state?.night_mode_enabled
              ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
              : 'bg-denon-surface/70 text-denon-muted hover:text-denon-text hover:bg-denon-surface'
          } ${applying || !state?.connected ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {applying ? 'Applying…' : state?.night_mode_enabled ? '🌙 On' : '🌙 Off'}
        </button>
      </div>

      <div className="space-y-2">
        {channelCodes.map(ch => {
          const cfg = config.channels[ch] || { mode: 'offset', value: -4 }
          const checked = Boolean(selected[ch])
          const label = info?.channel_names?.[ch] || ch
          const snapshotLevel = state?.night_mode_enabled ? state?.night_mode_snapshot?.[ch] : null
          return (
            <div key={ch} className={`grid grid-cols-[1.2rem_1fr_auto_auto_auto] items-center gap-2 rounded-xl px-2 py-2 ${checked ? 'bg-denon-surface/50' : 'bg-transparent'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggleChannel(ch, e.target.checked)}
                className="accent-denon-gold"
              />
              <span className="text-xs text-denon-text truncate">{label}</span>
              {checked ? (
                <>
                  <select
                    value={cfg.mode}
                    onChange={(e) => updateChannel(ch, { mode: e.target.value, value: e.target.value === 'offset' ? -4 : channelVolumes[ch] })}
                    className="bg-denon-dark border border-denon-border/50 rounded-lg text-xs px-2 py-1 text-denon-text"
                  >
                    <option value="absolute">Absolute</option>
                    <option value="offset">Offset</option>
                  </select>
                  <input
                    type="number"
                    min={cfg.mode === 'offset' ? -24 : 38}
                    max={cfg.mode === 'offset' ? 24 : 62}
                    value={cfg.value}
                    onChange={(e) => updateChannel(ch, { value: parseInt(e.target.value, 10) })}
                    className="w-16 bg-denon-dark border border-denon-border/50 rounded-lg text-xs px-2 py-1 text-denon-text tabular-nums"
                  />
                </>
              ) : (
                <div className="col-span-2" />
              )}
              <span className="text-[10px] text-denon-muted tabular-nums w-12 text-right" title={snapshotLevel != null ? 'Pre-night value' : 'Current value'}>
                ← {snapshotLevel ?? channelVolumes[ch]}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-denon-border/30">
        <button onClick={savePreset} className="text-xs text-denon-gold hover:text-denon-text transition-colors">
          Save Settings
        </button>
        <button onClick={resetAll} className="text-xs text-denon-muted hover:text-denon-red transition-colors">
          Reset All
        </button>
      </div>
    </div>
  )
}
