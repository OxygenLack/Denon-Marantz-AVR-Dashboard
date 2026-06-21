import { useEffect } from 'react'

const CACHE_RESET_VERSION = '2026-04-30-sw-cleanup-v3'
const STORAGE_KEY = 'denon-dashboard-cache-reset-version'

export default function CacheReset() {
  useEffect(() => {
    let cancelled = false
    const cleanup = async () => {
      if (cancelled) return
      if (!('serviceWorker' in navigator) && !window.caches) return
      if (localStorage.getItem(STORAGE_KEY) === CACHE_RESET_VERSION) return

      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map(registration => registration.unregister()))
        }
        if (window.caches) {
          const keys = await caches.keys()
          await Promise.all(keys.filter(key => key.startsWith('denon-dashboard-')).map(key => caches.delete(key)))
        }
        localStorage.setItem(STORAGE_KEY, CACHE_RESET_VERSION)
      } catch (err) {
        console.warn('Cache cleanup failed:', err)
      }
    }

    cleanup()
    return () => { cancelled = true }
  }, [])

  return null
}
