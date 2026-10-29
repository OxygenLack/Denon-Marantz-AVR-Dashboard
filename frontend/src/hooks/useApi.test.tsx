import { act, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toaster'
import { useApi } from './useApi'
import { labelFromPath } from './useApi'

describe('useApi', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns ok on a 2xx response without a toast', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })))
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    let res
    await act(async () => { res = await result.current.post('/media/play') })
    expect(res).toEqual({ ok: true, status: 200 })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('shows an error toast on a 502 and keeps the return contract', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 502, statusText: 'Bad Gateway', text: async () => 'Play command failed',
    })))
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    let res
    await act(async () => { res = await result.current.post('/media/play') })
    expect(res).toEqual({ ok: false, status: 502, error: 'Play command failed' })
    expect(screen.getByText('Play failed (502)')).toBeInTheDocument()
  })

  it('shows a network toast when fetch throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    await act(async () => { await result.current.post('/volume', { level: 50 }) })
    expect(screen.getByText('Volume failed (network)')).toBeInTheDocument()
  })
})

describe('useApi del/get', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('del sends DELETE without a body', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    let res
    await act(async () => { res = await result.current.del('/source-names/GAME') })
    expect(res).toEqual({ ok: true, status: 200 })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/source-names/GAME', { method: 'DELETE' })
  })

  it('get returns the parsed body as data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ device_name: 'AVR' }) })))
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    let res: { ok: boolean; data?: { device_name: string } } | undefined
    await act(async () => { res = await result.current.get<{ device_name: string }>('/device') })
    expect(res?.ok).toBe(true)
    expect(res?.data).toEqual({ device_name: 'AVR' })
  })

  it('toasts when a DELETE fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' })))
    const { result } = renderHook(() => useApi(), { wrapper: ToastProvider })
    await act(async () => { await result.current.del('/media/radio/favorites/s1') })
    expect(screen.getByText('S1 failed (404)')).toBeInTheDocument()
  })

  it('returns a stable object across renders', () => {
    const { result, rerender } = renderHook(() => useApi(), { wrapper: ToastProvider })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('labelFromPath', () => {
  it('uses the last path segment, capitalised', () => {
    expect(labelFromPath('/media/play')).toBe('Play')
    expect(labelFromPath('/night-mode/config')).toBe('Config')
    expect(labelFromPath('/source-names/GAME')).toBe('GAME')
    expect(labelFromPath('/')).toBe('Request')
  })
})
