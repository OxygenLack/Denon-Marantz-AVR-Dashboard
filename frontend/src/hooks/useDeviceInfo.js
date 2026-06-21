import { useEffect, useState } from 'react'

export function useDeviceInfo() {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/device')
      .then(r => r.json())
      .then(data => { setInfo(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const refresh = () => {
    fetch('/api/v1/refresh', { method: 'POST' })
      .then(() => fetch('/api/v1/device'))
      .then(r => r.json())
      .then(data => setInfo(data))
      .catch(() => {})
  }

  const reload = () => {
    fetch('/api/v1/device')
      .then(r => r.json())
      .then(data => setInfo(data))
      .catch(() => {})
  }

  return { info, loading, refresh, reload }
}
