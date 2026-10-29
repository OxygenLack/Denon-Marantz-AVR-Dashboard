import { useEffect, useState } from 'react'

interface ShortcutDetail {
  label?: string
}

export default function ShortcutOverlay() {
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onShortcut = (e: Event) => {
      const detail = (e as CustomEvent<ShortcutDetail>).detail
      const label = detail?.label
      if (!label) return
      setHint(label)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setHint(null), 900)
    }
    window.addEventListener('denon-shortcut', onShortcut)
    return () => {
      window.removeEventListener('denon-shortcut', onShortcut)
      window.clearTimeout(timer)
    }
  }, [])

  if (!hint) return null
  return <div className="shortcut-overlay">{hint}</div>
}
