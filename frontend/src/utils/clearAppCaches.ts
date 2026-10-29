const APP_CACHE_PREFIX = 'denon-dashboard-'

/**
 * Unregister every service worker and delete cached app files.
 * `allCaches` deletes every Cache Storage entry (error-screen recovery);
 * otherwise only the dashboard's own `denon-dashboard-*` caches go.
 * `isCancelled` is checked after each await so an unmounted caller stops early.
 */
export async function clearAppCaches(
  { allCaches = false, isCancelled = () => false }: { allCaches?: boolean; isCancelled?: () => boolean } = {},
): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    if (isCancelled()) return
    await Promise.all(registrations.map(registration => registration.unregister()))
    if (isCancelled()) return
  }
  if (window.caches) {
    const keys = await caches.keys()
    if (isCancelled()) return
    const doomed = allCaches ? keys : keys.filter(key => key.startsWith(APP_CACHE_PREFIX))
    await Promise.all(doomed.map(key => caches.delete(key)))
  }
}
