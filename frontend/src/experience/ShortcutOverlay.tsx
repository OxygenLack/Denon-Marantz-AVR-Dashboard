import { useEffect, useState } from 'react'

const LABELS: Record<string, string> = {
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

interface ShortcutDetail {
  label?: string
  key?: string
}

export default function ShortcutOverlay() {
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onShortcut = (e: Event) => {
      const detail = (e as CustomEvent<ShortcutDetail>).detail
      const label = detail?.label || (detail?.key ? LABELS[detail.key] : undefined)
      if (!label) return
      setHint(label)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setHint(null), 900)
    }
    window.addEventListener('denon-shortcut', onShortcut)
    return () => window.removeEventListener('denon-shortcut', onShortcut)
  }, [])

  if (!hint) return null
  return <div className="shortcut-overlay">{hint}</div>
}
