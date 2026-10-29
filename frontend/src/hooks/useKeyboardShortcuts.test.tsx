import { fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import type { ApiResponse, ReceiverState } from '../types'

function setup(state: ReceiverState = { connected: true, power: true, muted: false, play_state: 'pause' }) {
  const sendCommand = vi.fn()
  const post = vi.fn(async (): Promise<ApiResponse> => ({ ok: true, status: 200 }))
  const setZone = vi.fn()
  const hook = renderHook(
    ({ s }) => useKeyboardShortcuts({ state: s, post, sendCommand, zone: 'main', setZone }),
    { initialProps: { s: state } },
  )
  return { sendCommand, post, setZone, ...hook }
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('handles plain shortcuts', () => {
    const { sendCommand, post } = setup()
    fireEvent.keyDown(window, { key: 'm' })
    fireEvent.keyDown(window, { key: ' ' })
    expect(sendCommand).toHaveBeenCalledWith('MUON')
    expect(post).toHaveBeenCalledWith('/media/play')
  })

  it('ignores modifier combos (Cmd+P prints)', () => {
    const { sendCommand } = setup()
    fireEvent.keyDown(window, { key: 'p', metaKey: true })
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'm', altKey: true })
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('ignores key repeat', () => {
    const { sendCommand } = setup()
    fireEvent.keyDown(window, { key: 'm' })
    fireEvent.keyDown(window, { key: 'm', repeat: true })
    expect(sendCommand).toHaveBeenCalledTimes(1)
  })

  it('ignores keys while any modal is open', () => {
    const { sendCommand } = setup()
    const modal = document.createElement('div')
    modal.setAttribute('data-modal', 'night-mode')
    document.body.appendChild(modal)
    fireEvent.keyDown(window, { key: 'p' })
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('leaves Space to a focused button', () => {
    const { post } = setup()
    const { getByRole } = render(<button>Source</button>)
    fireEvent.keyDown(getByRole('button'), { key: ' ' })
    expect(post).not.toHaveBeenCalled()
  })

  it('registers the listener once across re-renders and uses the latest state', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const { sendCommand, rerender } = setup()
    const keydownAdds = () => add.mock.calls.filter(([type]) => type === 'keydown').length
    const before = keydownAdds()
    rerender({ s: { connected: true, muted: true } })
    rerender({ s: { connected: true, muted: true, volume: 40 } })
    expect(keydownAdds()).toBe(before)
    fireEvent.keyDown(window, { key: 'm' })
    expect(sendCommand).toHaveBeenCalledWith('MUOFF')
  })
})
