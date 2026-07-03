/**
 * Theme palette — sets CSS vars used throughout index.css and inline styles.
 * accent:    main highlight color (buttons, sliders, active states)
 * accentDim: darker variant (gradient end, thumb)
 */
import type { Theme, ThemeName } from './types'

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

const STORAGE_KEY = 'denon-dashboard-theme'

function isThemeName(name: string | null | undefined): name is ThemeName {
  return !!name && Object.prototype.hasOwnProperty.call(THEMES, name)
}

/** Get the active theme name: server-persisted default > local fallback > 'gold'. */
export function getTheme(serverDefault?: string | null): ThemeName {
  if (isThemeName(serverDefault)) return serverDefault
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isThemeName(stored)) return stored
  return 'gold'
}

/** Apply a theme by name and persist to localStorage. */
export function applyTheme(name: string | null | undefined): ThemeName {
  const key: ThemeName = isThemeName(name) ? name : 'gold'
  const t = THEMES[key]
  const root = document.documentElement
  root.style.setProperty('--accent',     t.accent)
  root.style.setProperty('--accent-dim', t.accentDim)
  return key
}

/** Set theme, apply it, and persist to localStorage. */
export function setTheme(name: string | null | undefined): ThemeName {
  const applied = applyTheme(name)
  localStorage.setItem(STORAGE_KEY, applied)
  return applied
}
