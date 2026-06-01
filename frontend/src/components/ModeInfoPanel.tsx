import { useEffect, useRef } from 'react'
import type { SoundModeEntry } from '../types'

interface Props {
  modeName: string
  modeInfo: SoundModeEntry | null
  onClose: () => void
}

const FIELDS: { key: keyof SoundModeEntry; label: string }[] = [
  { key: 'speakers',    label: 'Speakers' },
  { key: 'description', label: 'Description' },
  { key: 'bestFor',     label: 'Best For' },
  { key: 'notes',       label: 'Notes' },
]

export default function ModeInfoPanel({ modeName, modeInfo, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [modeName])

  if (!modeInfo) return null

  return (
    <div ref={ref} className="mt-3 pt-3 border-t border-denon-border/30 fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-denon-gold">{modeName}</span>
        <button
          onClick={onClose}
          className="w-5 h-5 rounded-full flex items-center justify-center text-denon-muted hover:text-denon-text hover:bg-denon-surface transition-colors text-xs"
          aria-label="Close info"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2">
        {FIELDS.map(({ key, label }) => (
          modeInfo[key] && (
            <div key={key}>
              <div className="text-[10px] uppercase tracking-wider text-denon-muted mb-0.5">{label}</div>
              <div className="text-xs text-denon-text leading-relaxed">{modeInfo[key]}</div>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
