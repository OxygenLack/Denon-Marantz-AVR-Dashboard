import { describe, expect, it } from 'vitest'
import { ambientFromState, parseSurroundMode } from './modeParser'

describe('parseSurroundMode', () => {
  it('detects Dolby Atmos', () => {
    const parsed = parseSurroundMode('DOLBY ATMOS')
    expect(parsed.codec).toBe('Dolby Atmos')
    expect(parsed.family).toBe('dolby')
    expect(parsed.upmixer).toBeNull()
  })

  it('detects DTS-HD MA with Neural:X upmixer', () => {
    const parsed = parseSurroundMode('DTS-HD MASTER+NEURAL:X')
    expect(parsed.codec).toBe('DTS-HD MA')
    expect(parsed.family).toBe('dts')
    expect(parsed.upmixer).toBe('DTS Neural:X')
  })

  it('falls back to the raw mode for unknown input', () => {
    const parsed = parseSurroundMode('SOMETHING ELSE')
    expect(parsed.codec).toBe('SOMETHING ELSE')
    expect(parsed.family).toBe('unknown')
  })

  it('handles null and empty input', () => {
    expect(parseSurroundMode(null).codec).toBe('Unknown')
    expect(parseSurroundMode(undefined).raw).toBe('')
  })
})

describe('ambientFromState', () => {
  it('reports disconnected before anything else', () => {
    expect(ambientFromState({ connected: false, power: true }).mood).toBe('disconnected')
  })

  it('reports standby when the receiver is off', () => {
    expect(ambientFromState({ connected: true, power: false }).mood).toBe('standby')
  })

  it('uses the codec colour while playing', () => {
    const a = ambientFromState({ connected: true, power: true, play_state: 'play', surround_mode: 'STEREO' })
    expect(a.mood).toBe('playing')
    expect(a.color).toBe(parseSurroundMode('STEREO').color)
  })
})
