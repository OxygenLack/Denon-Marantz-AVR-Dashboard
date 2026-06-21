# Keyboard Shortcuts

## Summary

Add global keyboard shortcuts for common actions. Active when the browser tab has focus (not when typing in an input field).

## Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Space` | Play / Pause | Media controls (HEOS sources only) |
| `↑` | Volume +1 dB | Main zone |
| `↓` | Volume -1 dB | Main zone |
| `Shift+↑` | Volume +0.5 dB | Main zone (half-step) |
| `Shift+↓` | Volume -0.5 dB | Main zone (half-step) |
| `M` | Mute toggle | Main zone |
| `P` | Power toggle | Main zone |
| `1`–`9` | Switch to source by index | Source selector (1 = first source, etc.) |
| `Z` | Toggle Zone 1 / Zone 2 | Zone selector |

## Implementation

### New hook: `useKeyboardShortcuts.js`

**File:** `frontend/src/hooks/useKeyboardShortcuts.js`

```jsx
import { useEffect } from 'react'

export function useKeyboardShortcuts({ state, post, sendCommand, zone, setZone }) {
  useEffect(() => {
    const handler = (e) => {
      // Don't intercept when user is typing in inputs
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Don't intercept when radio browser modal is open
      if (document.querySelector('[data-modal="radio"]')) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (state?.play_state === 'play') post('/media/pause')
          else post('/media/play')
          break
        case 'ArrowUp':
          e.preventDefault()
          if (e.shiftKey) sendCommand(`MV${Math.floor(state.volume)}5`)
          else sendCommand('MVUP')
          break
        case 'ArrowDown':
          e.preventDefault()
          if (e.shiftKey) sendCommand(`MV${Math.floor(state.volume)}5`)
          else sendCommand('MVDOWN')
          break
        case 'm':
        case 'M':
          e.preventDefault()
          state?.muted ? sendCommand('MUOFF') : sendCommand('MUON')
          break
        case 'p':
        case 'P':
          e.preventDefault()
          state?.power ? sendCommand('PWSTANDBY') : sendCommand('PWON')
          break
        case 'z':
        case 'Z':
          e.preventDefault()
          setZone(prev => prev === 'main' ? 'zone2' : 'main')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state, post, sendCommand, zone, setZone])
}
```

### Integration: `App.jsx`

Import and call at the top of App component:
```jsx
useKeyboardShortcuts({ state, post, sendCommand, zone, setZone })
```

### Visual hint

Add a small "?" icon in the StatusBar that shows a tooltip/panel with the shortcut list. Or show it once on first load with a dismissable toast.

## Edge Cases

- **Radio browser modal open** → shortcuts disabled (user is searching)
- **Input focused** → shortcuts disabled
- **Receiver not connected** → shortcuts silently fail (WebSocket will just not send)
- **Volume at min/max** → MVUP/MVDOWN are no-ops, receiver handles it

## Files to Create/Modify

| File | Action |
|------|--------|
| `frontend/src/hooks/useKeyboardShortcuts.js` | **Create** |
| `frontend/src/App.jsx` | Import and call hook |

## Effort

~20 minutes. Single file + one line in App.
