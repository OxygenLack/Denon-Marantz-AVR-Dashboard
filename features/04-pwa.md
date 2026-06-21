# PWA Support (Progressive Web App)

## Summary

Add a web manifest and basic service worker so the dashboard can be installed as a standalone app on mobile/desktop. "Add to Home Screen" on iOS/Android, standalone window without browser chrome.

## Implementation

### 1. Manifest

**File:** `frontend/public/manifest.json`

```json
{
  "name": "Denon Dashboard",
  "short_name": "Denon",
  "description": "Control your Denon/Marantz AVR receiver",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0D0D0D",
  "theme_color": "#C5A55A",
  "icons": [
    {
      "src": "/denon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Generate PNG icons from the existing SVG (`denon.svg`) — the manifest needs PNG fallbacks for iOS. A simple script or manual conversion.

### 2. Service Worker

**File:** `frontend/public/sw.js`

Minimal offline-capable SW:

```js
const CACHE = 'denon-dashboard-v1'
const PRECACHE = ['/', '/index.html', '/denon.svg', '/assets/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  )
})

self.addEventListener('fetch', (event) => {
  // API calls: network-only (don't cache state)
  if (event.request.url.includes('/api/')) return
  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  )
})
```

Register in `index.html`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0D0D0D" />
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
</script>
```

### 3. iOS-specific meta tags

Add to `index.html`:
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Denon" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

### 4. Install prompt (optional enhancement)

Detect `beforeinstallprompt` event and show a subtle banner:

```js
window.addEventListener('beforeinstallprompt', (e) => {
  deferredPrompt = e
  // Show a "Install App" button in the header
})
```

Not required for v1 — browsers show their own install prompts after repeat visits.

## Vite config

**File:** `frontend/vite.config.js` — ensure `public/` files are copied to dist:

Already works by default — Vite copies all files from `public/` to `dist/` root.

## Testing

- Chrome DevTools → Application → Manifest → verify all fields
- Chrome DevTools → Application → Service Workers → verify registered
- Lighthouse → PWA audit → should score 90+
- iOS Safari → Share → "Add to Home Screen" → opens standalone

## Files to Create/Modify

| File | Action |
|------|--------|
| `frontend/public/manifest.json` | **Create** |
| `frontend/public/sw.js` | **Create** |
| `frontend/public/icon-192.png` | **Create** (from SVG) |
| `frontend/public/icon-512.png` | **Create** (from SVG) |
| `frontend/index.html` | Add manifest link, meta tags, SW registration |

## Effort

~30 minutes. Boilerplate with one SVG-to-PNG conversion.
