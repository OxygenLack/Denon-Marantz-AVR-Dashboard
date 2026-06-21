import { useEffect, useState } from 'react'

const LABELS = {
  ' ': 'Play / Pause',
  ArrowUp: 'Volume Up',
  ArrowDown: 'Volume Down',
  M: 'Mute Toggle',
  m: 'Mute Toggle',
  P: 'Power Toggle',
  p: 'Power Toggle',
  Z: 'Zone Toggle',
  z: 'Zone Toggle',
}

export default function ShortcutOverlay() {
  const [hint, setHint] = useState(null)

  useEffect(() => {
    const onShortcut = (e) => {
      const label = e.detail?.label || LABELS[e.detail?.key]
      if (!label) return
      setHint(label)
      window.clearTimeout(onShortcut.timer)
      onShortcut.timer = window.setTimeout(() => setHint(null), 900)
    }
    window.addEventListener('denon-shortcut', onShortcut)
    return () => window.removeEventListener('denon-shortcut', onShortcut)
  }, [])

  if (!hint) return null
  return <div className="shortcut-overlay">{hint}</div>
}
