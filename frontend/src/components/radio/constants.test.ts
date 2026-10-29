import { describe, expect, it } from 'vitest'
import { decodeLabel, safeImageUrl } from './constants'

describe('safeImageUrl', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(safeImageUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png')
    expect(safeImageUrl('http://cdn.example/x.png')).toBe('http://cdn.example/x.png')
  })

  it('resolves relative paths against the base (default: page origin)', () => {
    expect(safeImageUrl('/demo.png', 'http://dash.local')).toBe('http://dash.local/demo.png')
    expect(safeImageUrl('/demo.png')).toBe(`${window.location.origin}/demo.png`)
  })

  it('rejects javascript:, data: and non-string values', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull()
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(safeImageUrl(undefined)).toBeNull()
    expect(safeImageUrl(42)).toBeNull()
  })
})

describe('decodeLabel', () => {
  it('decodes TuneIn percent-encoding', () => {
    expect(decodeLabel('News %26 Talk')).toBe('News & Talk')
    expect(decodeLabel('Top 40 %26 Pop Music')).toBe('Top 40 & Pop Music')
    expect(decodeLabel('Caf%C3%A9')).toBe('Café')
  })

  it('falls back on malformed sequences', () => {
    expect(decodeLabel('bad %E0%A4%A')).toBe('bad %E0%A4%A')
  })

  it('returns an empty string for empty input', () => {
    expect(decodeLabel(null)).toBe('')
    expect(decodeLabel('')).toBe('')
  })
})
