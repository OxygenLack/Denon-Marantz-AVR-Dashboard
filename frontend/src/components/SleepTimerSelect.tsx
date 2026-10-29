import { SLEEP_TIMER_PRESETS } from '../protocol'

interface Props {
  /** Minutes left, null/undefined when off. */
  value: number | null | undefined
  /** Applied on selection; null switches the timer off. */
  onChange: (minutes: number | null) => void
  label: string
  className?: string
}

const OFF = 'OFF'

/**
 * Sleep timer picker. A value that is not a preset (set on the remote, or a
 * running countdown) is shown as its own option so the select never lies.
 */
export default function SleepTimerSelect({ value, onChange, label, className = '' }: Props) {
  const current = value ?? null
  const options = current != null && !SLEEP_TIMER_PRESETS.includes(current)
    ? [...SLEEP_TIMER_PRESETS, current].sort((a, b) => a - b)
    : SLEEP_TIMER_PRESETS

  return (
    <select
      aria-label={label}
      value={current == null ? OFF : String(current)}
      onChange={e => onChange(e.target.value === OFF ? null : parseInt(e.target.value, 10))}
      className={`bg-denon-surface border border-denon-border/50 text-denon-text ${className}`}
    >
      <option value={OFF}>Off</option>
      {options.map(min => (
        <option key={min} value={min}>{min} min</option>
      ))}
    </select>
  )
}
