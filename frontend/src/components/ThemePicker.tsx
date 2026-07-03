import { useState, useRef, useEffect } from 'react'
import { THEMES, setTheme } from '../theme'
import type { ThemeName, Theme } from '../types'

interface Props {
  currentTheme: ThemeName
  onThemeChange: (name: ThemeName) => void
}

export default function ThemePicker({ currentTheme, onThemeChange }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const handlePick = async (name: ThemeName) => {
    setTheme(name)
    onThemeChange(name)
    setOpen(false)
    try {
      await fetch('/api/v1/ui-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: name }),
      })
    } catch (err) {
      console.warn('Could not persist theme:', err)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Gear icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-denon-muted hover:text-denon-text hover:bg-denon-surface/70 transition-all"
        title="Change theme"
        aria-label="Change theme"
      >
        <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {/* Theme dropdown */}
      {open && (
        <div className="absolute right-0 top-10 z-50 bg-denon-card border border-denon-border/60 rounded-2xl p-3 shadow-2xl shadow-black/40 backdrop-blur-xl fade-in min-w-[200px]">
          <p className="text-[10px] text-denon-muted uppercase tracking-wider mb-2.5 px-1">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(THEMES) as [ThemeName, Theme][]).map(([name, theme]) => (
              <button
                key={name}
                onClick={() => handlePick(name)}
                className={`flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl transition-all ${
                  currentTheme === name
                    ? 'bg-denon-surface ring-1 ring-denon-border'
                    : 'hover:bg-denon-surface/50'
                }`}
                title={theme.label}
              >
                <span
                  className="w-6 h-6 rounded-full ring-2 ring-offset-2 ring-offset-denon-card transition-all"
                  style={{
                    backgroundColor: theme.accent,
                    ringColor: currentTheme === name ? theme.accent : 'transparent',
                    boxShadow: currentTheme === name
                      ? `0 0 12px ${theme.accent}60`
                      : 'none',
                  } as React.CSSProperties}
                />
                <span className={`text-[10px] font-medium ${
                  currentTheme === name ? 'text-denon-text' : 'text-denon-muted'
                }`}>
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
