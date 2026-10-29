import { useEffect } from 'react'
import { clearAppCaches } from '../utils/clearAppCaches'

const CACHE_RESET_VERSION = '2026-04-30-sw-cleanup-v3'
const STORAGE_KEY = 'denon-dashboard-cache-reset-version'

export default function CacheReset(): null {
  useEffect(() => {
    let cancelled = false
    const cleanup = async () => {
      if (cancelled) return
      if (!('serviceWorker' in navigator) && !window.caches) return
      if (localStorage.getItem(STORAGE_KEY) === CACHE_RESET_VERSION) return

      try {
        await clearAppCaches({ isCancelled: () => cancelled })
        if (cancelled) return
        localStorage.setItem(STORAGE_KEY, CACHE_RESET_VERSION)
      } catch (err) {
        console.warn('Cache cleanup failed:', err)
      }
    }

    void cleanup()
    return () => { cancelled = true }
  }, [])

  return null
}
