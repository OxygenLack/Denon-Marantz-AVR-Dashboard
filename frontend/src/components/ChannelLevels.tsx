import { useState, useRef, useCallback } from 'react'
import type { PostFn } from '../types'

interface Props {
  channels: Record<string, number>
  channelNames: Record<string, string>
  sendCommand: (command: string) => void
  post: PostFn
  calibration?: Record<string, number>
}

const CHANNEL_ORDER = ['FL', 'FR', 'C', 'SW', 'SW2', 'SL', 'SR', 'SBL', 'SBR', 'SB',
  'FHL', 'FHR', 'FWL', 'FWR', 'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']

export default function ChannelLevels({ channels, channelNames, post, calibration }: Props) {
  const [localLevels, setLocalLevels] = useState<Record<string, number>>({})
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const entries = Object.entries(channels).sort((a, b) =>
    (CHANNEL_ORDER.indexOf(a[0]) === -1 ? 99 : CHANNEL_ORDER.indexOf(a[0])) -
    (CHANNEL_ORDER.indexOf(b[0]) === -1 ? 99 : CHANNEL_ORDER.indexOf(b[0]))
  )

  const handleChange = useCallback((ch: string, val: string) => {
    const v = parseInt(val)
    setLocalLevels(prev => ({ ...prev, [ch]: v }))

    if (debounceRefs.current[ch]) clearTimeout(debounceRefs.current[ch])
    debounceRefs.current[ch] = setTimeout(() => {
      post('/channel-volume', { channel: ch, level: v })
      setLocalLevels(prev => {
        const next = { ...prev }
        delete next[ch]
        return next
      })
    }, 200)
  }, [post])

  // Effective dB = Audyssey calibration offset + trim adjustment (50 = 0 dB)
  const effectiveDb = (ch: string, cvVal: number) => {
    const trim = cvVal - 50
    const cal = calibration?.[ch] ?? 0
    const total = cal + trim
    if (total > 0) return `+${total.toFixed(1)}`
    return total.toFixed(1)
  }

  const trimOnly = (cvVal: number) => {
    const t = cvVal - 50
    if (t === 0) return '±0'
    if (t > 0) return `+${t}`
    return `${t}`
  }

  if (entries.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-3">Speaker Levels</h2>
        <p className="text-xs text-denon-muted/60">Turn on the receiver to see speaker levels.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Speaker Levels</h2>
        <button
          onClick={() => post('/channel-volume/reset')}
          className="text-xs text-denon-muted hover:text-denon-red transition-colors"
        >
          Reset All
        </button>
      </div>
      <div className="space-y-3">
        {entries.map(([ch, serverVal]) => {
          const val = localLevels[ch] ?? serverVal
          const name = channelNames[ch] ?? ch
          const hasCal = calibration?.[ch] != null && calibration[ch] !== 0
          return (
            <div key={ch}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-denon-muted">{name}</span>
                <div className="flex items-center gap-2">
                  {hasCal && (
                    <span className="text-[10px] text-denon-muted/50" title={`Trim: ${trimOnly(val)} dB`}>
                      trim {trimOnly(val)}
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-denon-text font-semibold w-16 text-right">
                    {effectiveDb(ch, val)} dB
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={38} max={62} step={1}
                value={val}
                onChange={(e) => handleChange(ch, e.target.value)}
                className="w-full"
              />
            </div>
          )
        })}
      </div>
      {Object.keys(calibration ?? {}).length > 0 && (
        <p className="text-[10px] text-denon-muted/40 mt-3">
          Levels include Audyssey calibration offsets. Trim adjusts relative to calibration.
        </p>
      )}
    </div>
  )
}
