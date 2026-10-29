import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Debounce before `send` runs (ms). */
  delay?: number
  /** How long the optimistic value is held after sending, unless the server echoes first (ms). */
  holdMs?: number
}

/**
 * Optimistic slider value for a receiver level.
 *
 * `onChange` shows the new value at once and calls `send` after `delay`. The
 * value is then held until the server reports a change (its echo) or `holdMs`
 * pass; a failed send therefore snaps back to the server value together with
 * its error toast instead of right away. Timers are cleared on unmount.
 */
export function useDebouncedLevel(
  serverValue: number | undefined,
  send: (value: number) => unknown,
  { delay = 150, holdMs = 2000 }: Options = {},
): { value: number | undefined; onChange: (value: number) => void; pending: boolean } {
  const [local, setLocal] = useState<number | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  const clearHold = (): void => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  // Server echo: the receiver reported a new value, drop the optimistic one.
  // Ignored while a send is still pending, so the echo of an earlier step
  // does not yank the thumb back mid-drag.
  useEffect(() => {
    if (debounceTimer.current) return
    clearHold()
    setLocal(null)
  }, [serverValue])

  const onChange = useCallback((value: number): void => {
    setLocal(value)
    clearHold()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      sendRef.current(value)
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        setLocal(null)
      }, holdMs)
    }, delay)
  }, [delay, holdMs])

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  return { value: local ?? serverValue, onChange, pending: local !== null }
}
