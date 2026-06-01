import { useState, useRef, useCallback, useEffect } from 'react'
import type { ReceiverState, PostFn } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

export default function SubwooferLevel({ state, post }: Props) {
  const [level, setLevel] = useState(state.subwoofer_level ?? 50)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (state.subwoofer_level != null) setLevel(state.subwoofer_level)
  }, [state.subwoofer_level])

  const dB = (val: number | null) => {
    if (val == null) return '—'
    const d = val - 50
    if (d > 0) return `+${d}`
    return `${d}`
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value)
    setLevel(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => post('/subwoofer-level', { level: v, index: 1 }), 200)
  }, [post])

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-denon-muted">Subwoofer Level</h2>
        <span className="text-xs tabular-nums text-denon-text">{dB(level)} dB</span>
      </div>
      <input
        type="range" min={38} max={62} step={1}
        value={level} onChange={handleChange}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-denon-muted mt-1">
        <span>−12 dB</span>
        <span>0 dB</span>
        <span>+12 dB</span>
      </div>
    </div>
  )
}
