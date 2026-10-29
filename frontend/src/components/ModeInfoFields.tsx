import { MODE_INFO_FIELDS } from '../data/soundModeInfo'
import type { SoundModeEntry } from '../types'

interface Props {
  info: SoundModeEntry
  /** `compact` is the hover popover's smaller text. */
  compact?: boolean
}

/** The labelled description fields of a sound mode. */
export default function ModeInfoFields({ info, compact = false }: Props) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {MODE_INFO_FIELDS.map(({ key, label }) => (
        info[key] && (
          <div key={key}>
            <div className="text-[10px] uppercase tracking-wider text-denon-muted mb-0.5">{label}</div>
            <div className={`${compact ? 'text-[11px]' : 'text-xs'} text-denon-text leading-relaxed`}>{info[key]}</div>
          </div>
        )
      ))}
    </div>
  )
}
