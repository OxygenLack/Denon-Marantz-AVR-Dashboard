import type { ReactNode } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

interface Props<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T | null | undefined
  onChange: (value: T) => void
  /** Equal-width segments filling the row (otherwise they wrap). */
  grow?: boolean
  /** `solid` = filled accent pill, `soft` = tinted accent with a ring. */
  variant?: 'solid' | 'soft'
  size?: 'sm' | 'md'
  label?: string
}

const ACTIVE = {
  solid: 'bg-denon-gold text-denon-dark',
  soft: 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40',
}
const INACTIVE = {
  solid: 'bg-denon-surface text-denon-muted hover:bg-denon-border',
  soft: 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface',
}
const SIZE = {
  sm: 'text-xs px-3 py-1.5 rounded-lg',
  md: 'text-sm py-2.5 px-3 rounded-xl font-semibold',
}

/** A group of mutually exclusive buttons; the active one has aria-pressed. */
export default function SegmentedControl<T extends string>({
  options, value, onChange, grow = false, variant = 'solid', size = 'sm', label,
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className={grow ? 'flex gap-1.5' : 'flex flex-wrap gap-1.5'}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`${SIZE[size]} transition-all ${grow ? 'flex-1' : ''} ${active ? ACTIVE[variant] : INACTIVE[variant]}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
