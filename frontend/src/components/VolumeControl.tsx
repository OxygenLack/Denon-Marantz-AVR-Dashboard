import { useCallback } from 'react'
import { useDebouncedLevel } from '../hooks/useDebouncedLevel'
import VolumeButtons from './VolumeButtons'
import { VOLUME, formatDb } from '../protocol'
import type { ReceiverState, SendCommandFn, PostFn } from '../types'

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  post: PostFn
}

export default function VolumeControl({ state, sendCommand, post }: Props) {
  const volume = state?.volume
  const muted = state?.muted
  // MVMAX caps the slider; never above the protocol maximum.
  const sliderMax = Math.min(state?.volume_max ?? VOLUME.max, VOLUME.max)
  const sendVolume = useCallback((level: number) => post('/volume', { level }), [post])
  const { value: displayVol, onChange } = useDebouncedLevel(volume, sendVolume)
  const dB = displayVol != null ? formatDb(displayVol, VOLUME.zeroDb, { decimals: 1 }) : '—'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-1">Volume</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-denon-text">
              {displayVol != null ? displayVol : '—'}
            </span>
            <span className="text-sm text-denon-muted">{dB} dB</span>
          </div>
        </div>
        <VolumeButtons
          muted={muted}
          onDown={() => sendCommand('MVDOWN')}
          onUp={() => sendCommand('MVUP')}
          onToggleMute={() => sendCommand(muted ? 'MUOFF' : 'MUON')}
        />
      </div>
      <input
        type="range"
        aria-label="Main zone volume"
        min={VOLUME.min} max={sliderMax} step={0.5}
        value={displayVol ?? VOLUME.min}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-denon-muted/50 mt-1.5 px-0.5">
        <span>{formatDb(VOLUME.min, VOLUME.zeroDb)} dB</span>
        <span>0 dB</span>
        <span>{formatDb(sliderMax, VOLUME.zeroDb)} dB</span>
      </div>
    </div>
  )
}
