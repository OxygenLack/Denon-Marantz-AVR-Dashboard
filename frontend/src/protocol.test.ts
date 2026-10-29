import { describe, expect, it } from 'vitest'
import { TONE, TRIM, VOLUME, formatDb } from './protocol'

describe('formatDb', () => {
  it.each([
    [53, TRIM.zeroDb, {}, '+3'],
    [48, TRIM.zeroDb, {}, '-2'],
    [50, TRIM.zeroDb, {}, '0'],
    [50, TRIM.zeroDb, { zeroSign: true }, '±0'],
    [81.5, VOLUME.zeroDb, { decimals: 1 }, '+1.5'],
    [45, VOLUME.zeroDb, { decimals: 1 }, '-35.0'],
    [80, VOLUME.zeroDb, { decimals: 1 }, '0.0'],
    [56, TONE.zeroDb, {}, '+6'],
    [50 - 0.04, TRIM.zeroDb, { decimals: 1 }, '0.0'], // no "-0.0"
  ] as const)('formatDb(%s, %s, %o) = %s', (value, zero, opts, expected) => {
    expect(formatDb(value, zero, opts)).toBe(expected)
  })
})
