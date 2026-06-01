import { useState, useRef, useCallback, useEffect } from 'react'
import type { ReceiverState, PostFn } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

export default function ToneControls({ state, post }: Props) {
  const toneOn = state.tone_control
  const [bass, setBass] = useState(state.bass ?? 50)
  const [treble, setTreble] = useState(state.treble ?? 50)
  const bassRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trebleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (state.bass != null) setBass(state.bass)
    if (state.treble != null) setTreble(state.treble)
  }, [state.bass, state.treble])

  const dB = (val: number) => {
    const d = val - 50
    if (d > 0) return `+${d}`
    return `${d}`
  }

  const handleBass = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    setBass(v)
    if (bassRef.current) clearTimeout(bassRef.current)
    bassRef.current = setTimeout(() => post('/tone', { bass: v }), 200)
  }, [post])

  const handleTreble = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    setTreble(v)
    if (trebleRef.current) clearTimeout(trebleRef.current)
    trebleRef.current = setTimeout(() => post('/tone', { treble: v }), 200)
  }, [post])

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] text-denon-muted/70">Tone controls</h2>
        <button
          onClick={() => post('/tone', { enabled: !toneOn })}
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-denon-muted">Bass</span>
              <span className="text-xs tabular-nums text-denon-text">{dB(bass)} dB</span>
            </div>
            <input
              type="range" min={44} max={56} step={1}
              value={bass} onChange={handleBass}
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-denon-muted">Treble</span>
              <span className="text-xs tabular-nums text-denon-text">{dB(treble)} dB</span>
            </div>
            <input
              type="range" min={44} max={56} step={1}
              value={treble} onChange={handleTreble}
              className="w-full"
            />
          </div>
        </div>
      )}

      {!toneOn && (
        <p className="text-xs text-denon-muted/60">Enable tone controls to adjust bass and treble.</p>
      )}
    </div>
  )
}
