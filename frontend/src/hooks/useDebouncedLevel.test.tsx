import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedLevel } from './useDebouncedLevel'

describe('useDebouncedLevel', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const setup = (server = 50) => {
    const send = vi.fn()
    const hook = renderHook(({ v }) => useDebouncedLevel(v, send), { initialProps: { v: server as number | undefined } })
    return { send, ...hook }
  }

  it('shows the new value at once and sends it after the debounce', () => {
    const { result, send } = setup()
    act(() => { result.current.onChange(55) })
    expect(result.current.value).toBe(55)
    expect(send).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(150) })
    expect(send).toHaveBeenCalledWith(55)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('debounces a drag into one send', () => {
    const { result, send } = setup()
    act(() => { result.current.onChange(51) })
    act(() => { vi.advanceTimersByTime(100) })
    act(() => { result.current.onChange(52) })
    act(() => { vi.advanceTimersByTime(150) })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(52)
  })

  it('holds the value after sending until the server echoes', () => {
    const { result, rerender } = setup()
    act(() => { result.current.onChange(55) })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.value).toBe(55) // no snap-back to 50 while waiting
    expect(result.current.pending).toBe(true)
    rerender({ v: 55 })
    expect(result.current.value).toBe(55)
    expect(result.current.pending).toBe(false)
  })

  it('falls back to the server value when no echo arrives', () => {
    const { result } = setup()
    act(() => { result.current.onChange(55) })
    act(() => { vi.advanceTimersByTime(150 + 2000) })
    expect(result.current.value).toBe(50)
    expect(result.current.pending).toBe(false)
  })

  it('ignores a server change while a send is still pending', () => {
    const { result, rerender } = setup()
    act(() => { result.current.onChange(55) })
    rerender({ v: 51 }) // echo of an older step mid-drag
    expect(result.current.value).toBe(55)
  })

  it('clears its timers on unmount', () => {
    const { result, send, unmount } = setup()
    act(() => { result.current.onChange(55) })
    unmount()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(send).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
