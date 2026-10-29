import { useCallback } from 'react'
import { useDebouncedLevel } from '../hooks/useDebouncedLevel'
import { TONE, formatDb } from '../protocol'
import type { ReceiverState, PostFn } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

interface SliderProps {
  label: string
  value: number | undefined
  onChange: (value: number) => void
}

function ToneSlider({ label, value, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-denon-muted">{label}</span>
        <span className="text-xs tabular-nums text-denon-text">
          {value != null ? `${formatDb(value, TONE.zeroDb)} dB` : '—'}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={TONE.min} max={TONE.max} step={1}
        value={value ?? TONE.zeroDb}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full"
      />
    </div>
  )
}

export default function ToneControls({ state, post }: Props) {
  const toneOn = state.tone_control
  const sendBass = useCallback((bass: number) => post('/tone', { bass }), [post])
  const sendTreble = useCallback((treble: number) => post('/tone', { treble }), [post])
  const bass = useDebouncedLevel(state.bass, sendBass)
  const treble = useDebouncedLevel(state.treble, sendTreble)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Tone Controls</h2>
        <button
          onClick={() => post('/tone', { enabled: !toneOn })}
          aria-pressed={Boolean(toneOn)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
            toneOn
              ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/30'
              : 'bg-denon-surface text-denon-muted hover:text-denon-text'
          }`}
        >
          {toneOn ? 'On' : 'Off'}
        </button>
      </div>

      {toneOn && (
        <div className="space-y-4 fade-in">
          <ToneSlider label="Bass" value={bass.value} onChange={bass.onChange} />
          <ToneSlider label="Treble" value={treble.value} onChange={treble.onChange} />
        </div>
      )}

      {!toneOn && (
        <p className="text-xs text-denon-muted/60">Enable tone controls to adjust bass and treble.</p>
      )}
    </div>
  )
}
