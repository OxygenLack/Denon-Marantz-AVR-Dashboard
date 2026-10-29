import { describe, expect, it } from 'vitest'
import { orderChannels } from './channels'

describe('orderChannels', () => {
  const names = { FL: 'Front Left', FR: 'Front Right', C: 'Center', SW: 'Subwoofer' }

  it('follows the channelNames key order, not the receiver order', () => {
    expect(orderChannels({ SW: 50, C: 50, FR: 50, FL: 50 }, names)).toEqual(['FL', 'FR', 'C', 'SW'])
  })

  it('appends unknown codes in receiver order and skips absent ones', () => {
    expect(orderChannels({ XB: 50, C: 50, XA: 50 }, names)).toEqual(['C', 'XB', 'XA'])
  })

  it('handles empty input', () => {
    expect(orderChannels({}, names)).toEqual([])
    expect(orderChannels({ FL: 50 }, {})).toEqual(['FL'])
  })
})
