import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceInfo, ReceiverState } from '../types'
import { useApi } from './useApi'

/** GET /api/v1/device on mount; `reload()` re-fetches (after a save). */
export function useDeviceInfo(): { info: DeviceInfo | null; reload: () => Promise<void> } {
  const { get } = useApi()
  const [info, setInfo] = useState<DeviceInfo | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const res = await get<DeviceInfo>('/device')
    if (res.ok && res.data) setInfo(res.data)
  }, [get])

  useEffect(() => { void reload() }, [reload])

  return { info, reload }
}

const channelKey = (levels: Record<string, number> | undefined): string =>
  Object.keys(levels ?? {}).sort().join('|')

/**
 * Keep /device in step with the live receiver state. /device is fetched once,
 * but its channel names and source list are built from what the receiver had
 * reported at that moment: a page opened while the AVR was in standby (or
 * before the first status poll) would show raw channel codes forever.
 *
 * Reloads when the live channel set differs from the one /device was built
 * from, and when the telnet link comes up (false → true). Stops once they
 * match; a failed reload leaves `info` unchanged and does not retry in a loop.
 */
export function useDeviceInfoSync(
  state: ReceiverState | null,
  info: DeviceInfo | null,
  reload: () => Promise<void>,
): void {
  const liveKey = state?.connected ? channelKey(state.channel_volumes) : ''
  const infoKey = channelKey(info?.channel_volumes)

  useEffect(() => {
    if (info && liveKey && liveKey !== infoKey) void reload()
  }, [info, liveKey, infoKey, reload])

  // null until the first state frame, so the initial frame is no "transition".
  const connected = state ? Boolean(state.connected) : null
  const prevConnected = useRef<boolean | null>(connected)
  useEffect(() => {
    if (connected && prevConnected.current === false) void reload()
    prevConnected.current = connected
  }, [connected, reload])
}
