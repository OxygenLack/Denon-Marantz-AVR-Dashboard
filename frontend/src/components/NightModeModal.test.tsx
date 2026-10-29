import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NightModeModal from './NightModeModal'
import type { ApiResponse, DeviceInfo, ReceiverState } from '../types'

const state: ReceiverState = { connected: true, channel_volumes: { FL: 50, SW: 52 } }
const info: DeviceInfo = {
  channel_names: { FL: 'Front Left', SW: 'Subwoofer' },
  time_settings: { timezone: 'Europe/Berlin', time_format: '24h' },
  night_mode_config: {
    mode: 'offset',
    channels: [{ channel: 'SW', mode: 'offset', value: -6 }],
    schedule: { enabled: false, days: [], start: '22:00', end: '02:00', timezone: 'Europe/Berlin' },
  },
}
const post = vi.fn(async (): Promise<ApiResponse> => ({ ok: true, status: 200 }))

function renderModal(onConfigChange: () => Promise<ApiResponse>, onClose = vi.fn()) {
  render(
    <NightModeModal open onClose={onClose} state={state} info={info} post={post} onConfigChange={onConfigChange} />,
  )
  return onClose
}

describe('NightModeModal', () => {
  it('shows "Settings saved" when the save succeeds', async () => {
    const save = vi.fn(async () => ({ ok: true, status: 200 }))
    renderModal(save)
    await act(async () => { fireEvent.click(screen.getByText('Save Settings')) })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'offset',
      channels: [{ channel: 'SW', mode: 'offset', value: -6 }],
    }))
    expect(screen.getByText('Settings saved')).toBeInTheDocument()
  })

  it('shows "Save failed" and re-enables the button when the save fails', async () => {
    renderModal(vi.fn(async () => ({ ok: false, status: 502 })))
    await act(async () => { fireEvent.click(screen.getByText('Save Settings')) })
    expect(screen.getByText('Save failed')).toBeInTheDocument()
    expect(screen.getByText('Save Settings')).toBeEnabled()
  })

  it('re-enables the button when the save throws', async () => {
    renderModal(vi.fn(async () => { throw new Error('boom') }))
    await act(async () => { fireEvent.click(screen.getByText('Save Settings')) })
    await waitFor(() => expect(screen.getByText('Save Settings')).toBeEnabled())
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })

  it('closes on Escape (after the closing animation)', async () => {
    const onClose = renderModal(vi.fn(async () => ({ ok: true, status: 200 })))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('parses a typed time on blur', async () => {
    const save = vi.fn(async () => ({ ok: true, status: 200 }))
    renderModal(save)
    const from = screen.getByDisplayValue('22:00')
    fireEvent.change(from, { target: { value: '23:15' } })
    fireEvent.blur(from)
    await act(async () => { fireEvent.click(screen.getByText('Save Settings')) })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      schedule: expect.objectContaining({ start: '23:15' }),
    }))
  })
})
