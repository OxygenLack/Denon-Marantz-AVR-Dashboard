import { describe, expect, it } from 'vitest'
import { formatTimeLabel, parseTimeInput, resolveTimeFormat } from './timeFormat'

describe('formatTimeLabel', () => {
  it('returns a dash for empty values', () => {
    expect(formatTimeLabel(null)).toBe('—')
    expect(formatTimeLabel('')).toBe('—')
  })

  it('passes 24h values through unchanged', () => {
    expect(formatTimeLabel('22:30', '24h')).toBe('22:30')
  })

  it('converts to 12h with AM/PM', () => {
    expect(formatTimeLabel('00:15', '12h')).toBe('12:15 AM')
    expect(formatTimeLabel('12:00', '12h')).toBe('12:00 PM')
    expect(formatTimeLabel('22:30', '12h')).toBe('10:30 PM')
  })
})

describe('parseTimeInput', () => {
  it('parses plain 24h input', () => {
    expect(parseTimeInput('7:05')).toBe('07:05')
    expect(parseTimeInput('23:59')).toBe('23:59')
  })

  it('parses 12h input with AM/PM', () => {
    expect(parseTimeInput('10:30 PM')).toBe('22:30')
    expect(parseTimeInput('12 am')).toBe('00:00')
    expect(parseTimeInput('12:00pm')).toBe('12:00')
  })

  it('falls back on invalid input', () => {
    expect(parseTimeInput('25:00', '01:00')).toBe('01:00')
    expect(parseTimeInput('garbage')).toBe('00:00')
    expect(parseTimeInput('')).toBe('00:00')
  })
})

describe('resolveTimeFormat', () => {
  it('honours an explicit config value', () => {
    expect(resolveTimeFormat('12h', 'Europe/Berlin')).toBe('12h')
    expect(resolveTimeFormat('24h', 'America/New_York')).toBe('24h')
  })

  it('prefers 24h for European timezones on auto', () => {
    expect(resolveTimeFormat('auto', 'Europe/Berlin')).toBe('24h')
  })
})
