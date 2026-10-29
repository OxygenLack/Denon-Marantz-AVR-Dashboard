// Protocol facts the UI needs (mirrors backend/denon/const.py). Lists that
// depend on the receiver (sources, channels, surround modes) come from
// /api/v1/device instead.

export interface LevelRange {
  min: number
  max: number
  /** Raw value that reads as 0 dB. */
  zeroDb: number
}

/** Master/Zone 2 volume: 0–98, 80 = 0 dB, half steps on the main zone. */
export const VOLUME: LevelRange = { min: 0, max: 98, zeroDb: 80 }
/** Channel and subwoofer trim (CV / PSSWL): 38–62, 50 = 0 dB. */
export const TRIM: LevelRange = { min: 38, max: 62, zeroDb: 50 }
/** Bass / treble: 44–56, 50 = 0 dB. */
export const TONE: LevelRange = { min: 44, max: 56, zeroDb: 50 }

export const SLEEP_TIMER_PRESETS: readonly number[] = [10, 20, 30, 60, 90, 120]

/**
 * Signed dB text for a raw level: `+3`, `-2`, `0` (or `±0`), `+1.5`.
 * No unit; callers append " dB" where they want it.
 */
export function formatDb(
  value: number,
  zeroDb: number,
  { decimals = 0, zeroSign = false }: { decimals?: number; zeroSign?: boolean } = {},
): string {
  const db = value - zeroDb
  const text = Math.abs(db).toFixed(decimals)
  if (Number(text) === 0) return zeroSign ? '±0' : text
  return `${db > 0 ? '+' : '-'}${text}`
}
