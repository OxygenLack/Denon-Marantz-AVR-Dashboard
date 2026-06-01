import type { Theme, ThemeConfig, ThemeName } from './types'

export const THEMES: Record<ThemeName, Theme> = {
  gold:   { label: 'Gold',   accent: '#C5A55A', accentDim: '#a08840' },
  blue:   { label: 'Blue',   accent: '#3B82F6', accentDim: '#1d4ed8' },
  red:    { label: 'Red',    accent: '#EF4444', accentDim: '#b91c1c' },
  green:  { label: 'Green',  accent: '#22C55E', accentDim: '#15803d' },
  olive:  { label: 'Olive',  accent: '#84CC16', accentDim: '#4d7c0f' },
  violet: { label: 'Violet', accent: '#8B5CF6', accentDim: '#6d28d9' },
  purple: { label: 'Purple', accent: '#A855F7', accentDim: '#7e22ce' },
  pink:   { label: 'Pink',   accent: '#EC4899', accentDim: '#be185d' },
  orange: { label: 'Orange', accent: '#F97316', accentDim: '#c2410c' },
}

const STRUCTURAL_DEFAULTS: Record<string, string> = {
  '--bg':      '#0D0D0D',
  '--card':    '#1A1A1A',
  '--surface': '#242424',
  '--border':  '#333333',
  '--text':    '#E5E5E5',
  '--muted':   '#888888',
}

export function applyThemeConfig(config: ThemeConfig): void {
  const t = THEMES[config.base] ?? THEMES.gold
  const root = document.documentElement
  root.style.setProperty('--accent', t.accent)
  root.style.setProperty('--accent-dim', t.accentDim)
  for (const [k, v] of Object.entries(STRUCTURAL_DEFAULTS)) {
    root.style.setProperty(k, v)
  }
  for (const [k, v] of Object.entries(config.overrides)) {
    root.style.setProperty(k, v)
  }
}

export async function saveThemeToServer(config: ThemeConfig): Promise<void> {
  const res = await fetch('/api/v1/preferences/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(text)
  }
}
