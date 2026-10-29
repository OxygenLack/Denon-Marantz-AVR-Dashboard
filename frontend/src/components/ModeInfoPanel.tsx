import { useEffect, useRef } from 'react'
import ModeInfoFields from './ModeInfoFields'
import type { SoundModeEntry } from '../types'

interface Props {
  modeName: string
  modeInfo: SoundModeEntry | null | undefined
  onClose: () => void
}

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
      <ModeInfoFields info={modeInfo} />
    </div>
  )
}
