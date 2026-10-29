import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import type { RadioStatus } from './constants'

const OFFLINE: RadioStatus = {
  ready: false, reason: 'no_heos', heos_connected: false,
  account_signed_in: false, tunein_available: false, cached_stations: 0,
  preloading: false,
}

interface Options {
  open: boolean
  /** Called before a refresh is requested: clear local caches, reset counts. */
  onBeforeRefresh?: () => void
  /** Called after the refresh request: bump list retry counters. */
  onAfterRefresh?: () => void
}

/**
 * Probe whether internet radio is usable (HEOS account / TuneIn) and track the
 * backend station preload. While `preloading`, /radio/status is re-polled
 * every 3 s so the header flips to the station count on its own.
 */
export function useRadioStatus({ open, onBeforeRefresh, onAfterRefresh }: Options) {
  const { post } = useApi()
  const [radioStatus, setRadioStatus] = useState<RadioStatus | null>(null)
  const [statusChecking, setStatusChecking] = useState(false)
  const [statusRetry, setStatusRetry] = useState(0)
  const preloading = radioStatus?.preloading === true

  useEffect(() => {
    if (!open) { setRadioStatus(null); return }
    let active = true
    setStatusChecking(true)
    fetch('/api/v1/media/radio/status')
      .then(r => r.json())
      .then((d: RadioStatus) => { if (active) setRadioStatus(d) })
      .catch(() => { if (active) setRadioStatus(OFFLINE) })
      .finally(() => { if (active) setStatusChecking(false) })
    return () => { active = false }
  }, [open, statusRetry])

  useEffect(() => {
    if (!open || !preloading) return
    let active = true
    const tick = async () => {
      try {
        const r = await fetch('/api/v1/media/radio/status')
        const d = await r.json() as RadioStatus
        if (active) setRadioStatus(d)
      } catch { /* keep polling */ }
    }
    const interval = setInterval(tick, 3000)
    return () => { active = false; clearInterval(interval) }
  }, [open, preloading])

  // Ask the backend for a fresh (single-flight) preload, then re-probe status.
  const refreshStations = async () => {
    if (statusChecking || preloading) return
    setStatusChecking(true)
    onBeforeRefresh?.()
    await post('/media/radio/refresh')  // a failure toasts inside post()
    setStatusRetry(c => c + 1)
    onAfterRefresh?.()
  }

  return { radioStatus, statusChecking, preloading, refreshStations }
}
