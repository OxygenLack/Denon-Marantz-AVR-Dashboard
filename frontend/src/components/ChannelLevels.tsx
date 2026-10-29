import { useCallback, useMemo } from 'react'
import { useDebouncedLevel } from '../hooks/useDebouncedLevel'
import { TRIM, formatDb } from '../protocol'
import { orderChannels } from '../utils/channels'
import type { PostFn } from '../types'

interface Props {
  channels: Record<string, number>
  channelNames: Record<string, string>
  post: PostFn
  calibration?: Record<string, number>
}

interface RowProps {
  ch: string
  name: string
  serverValue: number
  calibration: number | undefined
  post: PostFn
}

function ChannelRow({ ch, name, serverValue, calibration, post }: RowProps) {
  const send = useCallback((level: number) => post('/channel-volume', { channel: ch, level }), [post, ch])
  const { value, onChange } = useDebouncedLevel(serverValue, send)
  const level = value ?? serverValue
  const hasCal = calibration != null && calibration !== 0
  // Effective dB = Audyssey calibration offset + trim (CV 50 = 0 dB trim).
  const effective = formatDb(level + (calibration ?? 0), TRIM.zeroDb, { decimals: 1 })
  const trim = formatDb(level, TRIM.zeroDb, { zeroSign: true })

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-denon-muted">{name}</span>
        <div className="flex items-center gap-2">
          {hasCal && (
            <span className="text-[10px] text-denon-muted/50" title={`Trim: ${trim} dB`}>
              trim {trim}
            </span>
          )}
          <span className="text-xs tabular-nums text-denon-text font-semibold w-16 text-right">
            {effective} dB
          </span>
        </div>
      </div>
      <input
        type="range"
        aria-label={`${name} level`}
        min={TRIM.min} max={TRIM.max} step={1}
        value={level}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full"
      />
    </div>
  )
}

export default function ChannelLevels({ channels, channelNames, post, calibration }: Props) {
  const codes = useMemo(() => orderChannels(channels, channelNames), [channels, channelNames])

  if (codes.length === 0) {
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
        {codes.map(ch => (
          <ChannelRow
            key={ch}
            ch={ch}
            name={channelNames[ch] || ch}
            serverValue={channels[ch]}
            calibration={calibration?.[ch]}
            post={post}
          />
        ))}
      </div>
      {Object.keys(calibration || {}).length > 0 && (
        <p className="text-[10px] text-denon-muted/40 mt-3">
          Levels include Audyssey calibration offsets. Trim adjusts relative to calibration.
        </p>
      )}
    </div>
  )
}
