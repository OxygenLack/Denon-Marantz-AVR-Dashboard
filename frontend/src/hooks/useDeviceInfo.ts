import { useEffect, useState } from 'react'
import { DEMO_MODE, DEMO_DEVICE_INFO } from '../demoData'
import type { DeviceInfo } from '../types'

export function useDeviceInfo(): {
  info: DeviceInfo | null
  loading: boolean
  refresh: () => void
  refreshDevice: () => void
} {
  const [info, setInfo] = useState<DeviceInfo | null>(DEMO_MODE ? DEMO_DEVICE_INFO : null)
  const [loading, setLoading] = useState(!DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE) return
    fetch('/api/v1/device')
      .then(r => r.json() as Promise<DeviceInfo>)
      .then(data => { setInfo(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const refreshDevice = () => {
    if (DEMO_MODE) return
    fetch('/api/v1/device')
      .then(r => r.json() as Promise<DeviceInfo>)
      .then(data => setInfo(data))
      .catch(() => {})
  }

  const refresh = () => {
    if (DEMO_MODE) return
    fetch('/api/v1/refresh', { method: 'POST' })
      .then(() => fetch('/api/v1/device'))
      .then(r => r.json() as Promise<DeviceInfo>)
      .then(data => setInfo(data))
      .catch(() => {})
  }

  return { info, loading, refresh, refreshDevice }
}
