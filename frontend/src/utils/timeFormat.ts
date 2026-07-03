export function detectSystemTimeFormat(): '24h' | '12h' | null {
  try {
    const sample = new Date(2020, 0, 1, 13, 0, 0)
    // hourCycle exists at runtime but is missing from the lib's resolved-options type.
    const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions() as
      Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string }
    if (resolved.hourCycle === 'h23' || resolved.hourCycle === 'h24') return '24h'
    if (resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12') {
      // Some browsers expose locale hourCycle but still format according to OS overrides.
      const formatted = sample.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      if (/\b13[:.]/.test(formatted)) return '24h'
      return '12h'
    }

    const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(sample)
    return parts.some(part => part.type === 'dayPeriod') ? '12h' : '24h'
  } catch {
    return null
  }
}

export function resolveTimeFormat(configValue: string | undefined, timezone: string | undefined): '24h' | '12h' {
  if (configValue === '12h') return '12h'
  if (configValue === '24h') return '24h'

  const detected = detectSystemTimeFormat()
  if (detected === '24h') return '24h'

  // Browser APIs cannot reliably read the macOS 24-hour clock setting when the
  // browser language is en-US. For European dashboard timezones, prefer 24h as
  // the safer regional default when auto-detection reports 12h.
  if (timezone?.startsWith('Europe/')) return '24h'

  return detected || '24h'
}

export function formatTimeLabel(value: string | null | undefined, format: '24h' | '12h' = '24h'): string {
  if (!value) return '—'
  const [hourRaw, minute = '00'] = value.split(':')
  const hour = Number(hourRaw)
  if (format !== '12h' || !Number.isFinite(hour)) return value
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${minute} ${suffix}`
}

export function formatTimeInput(value: string | null | undefined, format: '24h' | '12h' = '24h'): string {
  return formatTimeLabel(value, format)
}

export function parseTimeInput(input: string | null | undefined, fallback = '00:00'): string {
  const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!raw) return fallback

  const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M?\.?$/)
  if (ampm) {
    let hour = Number(ampm[1])
    const minute = Number(ampm[2] ?? '00')
    if (hour < 1 || hour > 12 || minute > 59) return fallback
    const suffix = ampm[3]
    if (suffix === 'P' && hour !== 12) hour += 12
    if (suffix === 'A' && hour === 12) hour = 0
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  const plain = raw.match(/^(\d{1,2})(?::(\d{2}))$/)
  if (plain) {
    const hour = Number(plain[1])
    const minute = Number(plain[2])
    if (hour > 23 || minute > 59) return fallback
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  return fallback
}
