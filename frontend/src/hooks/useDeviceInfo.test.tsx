import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toaster'
import { useDeviceInfo, useDeviceInfoSync } from './useDeviceInfo'
import type { ReceiverState } from '../types'

describe('useDeviceInfo', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('loads /device on mount and reloads on demand', async () => {
    let name = 'First'
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ device_name: name }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useDeviceInfo(), { wrapper: ToastProvider })

    await waitFor(() => expect(result.current.info?.device_name).toBe('First'))
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/device', { method: 'GET' })

    name = 'Second'
    await act(async () => { await result.current.reload() })
    expect(result.current.info?.device_name).toBe('Second')
  })

  it('keeps the last info when a reload fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ device_name: 'AVR' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'err', text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useDeviceInfo(), { wrapper: ToastProvider })
    await waitFor(() => expect(result.current.info?.device_name).toBe('AVR'))
    await act(async () => { await result.current.reload() })
    expect(result.current.info?.device_name).toBe('AVR')
  })
})

describe('useDeviceInfoSync', () => {
  const info = (levels: Record<string, number>) => ({ channel_volumes: levels, channel_names: {} })

  it('reloads when the live channel set differs from /device, then stops', () => {
    const reload = vi.fn(async () => {})
    const { rerender } = renderHook(
      ({ s, i }) => useDeviceInfoSync(s, i, reload),
      { initialProps: { s: { connected: true, channel_volumes: { FL: 50, FR: 50 } }, i: info({}) } },
    )
    expect(reload).toHaveBeenCalledTimes(1)
    // /device now matches the live set: level changes alone do not reload.
    rerender({ s: { connected: true, channel_volumes: { FL: 51, FR: 50 } }, i: info({ FL: 50, FR: 50 }) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload while disconnected or before /device loaded', () => {
    const reload = vi.fn(async () => {})
    renderHook(() => useDeviceInfoSync({ connected: false, channel_volumes: { FL: 50 } }, info({}), reload))
    renderHook(() => useDeviceInfoSync({ connected: true, channel_volumes: { FL: 50 } }, null, reload))
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when the receiver link comes up, not on the first frame', () => {
    const reload = vi.fn(async () => {})
    const same = info({ FL: 50 })
    const { rerender } = renderHook(
      ({ s }) => useDeviceInfoSync(s, same, reload),
      { initialProps: { s: null as ReceiverState | null } },
    )
    rerender({ s: { connected: true, channel_volumes: { FL: 50 } } })
    expect(reload).not.toHaveBeenCalled()
    rerender({ s: { connected: false } })
    rerender({ s: { connected: true, channel_volumes: { FL: 50 } } })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
