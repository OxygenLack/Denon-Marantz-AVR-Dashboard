import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toaster'
import { useDeviceInfo } from './useDeviceInfo'

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
