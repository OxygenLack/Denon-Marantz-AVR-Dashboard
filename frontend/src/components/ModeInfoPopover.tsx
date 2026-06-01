import { useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SoundModeEntry } from '../types'

interface Props {
  modeName: string
  modeInfo: SoundModeEntry | null
  anchorEl: HTMLElement | null | undefined
}

const FIELDS: { key: keyof SoundModeEntry; label: string }[] = [
  { key: 'speakers',    label: 'Speakers' },
  { key: 'description', label: 'Description' },
  { key: 'bestFor',     label: 'Best For' },
  { key: 'notes',       label: 'Notes' },
]

const POPOVER_WIDTH = 300
const GAP = 8

interface PopoverPos {
  left: number
  top: number
  above: boolean
}

export default function ModeInfoPopover({ modeName, modeInfo, anchorEl }: Props) {
  const [pos, setPos] = useState<PopoverPos | null>(null)

  useLayoutEffect(() => {
    if (!anchorEl) return
    const rect = anchorEl.getBoundingClientRect()
    const above = rect.top > 220
    const left = Math.max(GAP, Math.min(
      rect.left + rect.width / 2 - POPOVER_WIDTH / 2,
      window.innerWidth - POPOVER_WIDTH - GAP,
    ))
    setPos({ left, top: above ? rect.top - GAP : rect.bottom + GAP, above })
  }, [anchorEl])

  if (!modeInfo || !pos) return null

  const style: React.CSSProperties = {
    position: 'fixed',
    left: pos.left,
    width: POPOVER_WIDTH,
    maxWidth: '90vw',
    zIndex: 50,
    ...(pos.above
      ? { bottom: window.innerHeight - pos.top }
      : { top: pos.top }),
  }

  return createPortal(
    <div
      style={style}
      className="bg-denon-card border border-denon-border rounded-xl p-3 shadow-xl shadow-black/40 backdrop-blur-sm fade-in pointer-events-none"
    >
      <div className="text-xs font-semibold text-denon-gold mb-2">{modeName}</div>
      <div className="space-y-1.5">
        {FIELDS.map(({ key, label }) => (
          modeInfo[key] && (
            <div key={key}>
              <div className="text-[10px] uppercase tracking-wider text-denon-muted mb-0.5">{label}</div>
              <div className="text-[11px] text-denon-text leading-relaxed">{modeInfo[key]}</div>
            </div>
          )
        ))}
      </div>
    </div>,
    document.body,
  )
}
