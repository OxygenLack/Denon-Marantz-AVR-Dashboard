import { useEffect, useState } from 'react'
import type { DeviceInfo } from '../types'

export function useDeviceInfo(): {
  info: DeviceInfo | null
  loading: boolean
  refresh: () => void
  reload: () => void
} {
  const [info, setInfo] = useState<DeviceInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/device')
      .then(r => r.json())
      .then((data: DeviceInfo) => { setInfo(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const refresh = (): void => {
    fetch('/api/v1/refresh', { method: 'POST' })
      .then(() => fetch('/api/v1/device'))
      .then(r => r.json())
      .then((data: DeviceInfo) => setInfo(data))
      .catch(() => {})
  }

  const reload = (): void => {
    fetch('/api/v1/device')
      .then(r => r.json())
      .then((data: DeviceInfo) => setInfo(data))
      .catch(() => {})
  }

  return { info, loading, refresh, reload }
}
