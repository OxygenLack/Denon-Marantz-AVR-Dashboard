// Denon Dashboard service worker kill-switch.
// Previous versions used cache-first and could keep serving stale app bundles during local development.
// This version removes all denon-dashboard caches and unregisters itself.

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.caches) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith('denon-dashboard-')).map((key) => caches.delete(key)))
    }
    await self.clients.claim()
    await self.registration.unregister()
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) {
      client.postMessage({ type: 'DENON_SW_UNREGISTERED' })
    }
  })())
})

self.addEventListener('fetch', () => {
  // Intentionally no respondWith: let the browser hit the network normally.
})
