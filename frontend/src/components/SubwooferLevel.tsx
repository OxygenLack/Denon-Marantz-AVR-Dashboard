import { useCallback } from 'react'
import { useDebouncedLevel } from '../hooks/useDebouncedLevel'
import { TRIM, formatDb } from '../protocol'
import type { ReceiverState, PostFn } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

export default function SubwooferLevel({ state, post }: Props) {
  const send = useCallback((level: number) => post('/subwoofer-level', { level, index: 1 }), [post])
  const { value, onChange } = useDebouncedLevel(state.subwoofer_level, send)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-denon-muted">Subwoofer Level</h2>
        <span className="text-xs tabular-nums text-denon-text">
          {value != null ? `${formatDb(value, TRIM.zeroDb)} dB` : '—'}
        </span>
      </div>
      <input
        type="range"
        aria-label="Subwoofer level"
        min={TRIM.min} max={TRIM.max} step={1}
        value={value ?? TRIM.zeroDb}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-denon-muted mt-1">
        <span>{formatDb(TRIM.min, TRIM.zeroDb)} dB</span>
        <span>0 dB</span>
        <span>{formatDb(TRIM.max, TRIM.zeroDb)} dB</span>
      </div>
    </div>
  )
}
