import { useCallback, useEffect, useState } from 'react'
import type { DeviceInfo } from '../types'
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
