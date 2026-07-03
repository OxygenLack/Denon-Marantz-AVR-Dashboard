import { useEffect } from 'react'

/**
 * Adds a root class when the dashboard is not the active foreground tab/window.
 * CSS uses this to stop decorative animations, gradients and expensive effects.
 */
export function useForegroundEffects(): void {
  useEffect(() => {
    const root = document.documentElement

    const update = (): void => {
      const foreground = document.visibilityState === 'visible' && document.hasFocus()
      root.classList.toggle('app-not-foreground', !foreground)
    }

    update()
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    window.addEventListener('pageshow', update)
    window.addEventListener('pagehide', update)

    return () => {
      root.classList.remove('app-not-foreground')
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      window.removeEventListener('pageshow', update)
      window.removeEventListener('pagehide', update)
    }
  }, [])
}
