import { useRef, useState } from 'react'
import RadioBrowser from './RadioBrowser'
import type { ReceiverState, SendCommandFn, SourceEntry, RadioFavorite, Zone } from '../types'

const RadioTowerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
    <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
    <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
    <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <path d="M12 14v7" />
  </svg>
)

const BluetoothIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M7 7l10 10-5 5V2l5 5L7 17" />
  </svg>
)

const SpotifyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="inline w-4 h-4 align-text-bottom">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.6.6 0 0 1-.84.2c-2.3-1.4-5.2-1.72-8.6-.94a.6.6 0 1 1-.28-1.18c3.74-.86 6.94-.48 9.52 1.08a.6.6 0 0 1 .2.84zm1.22-2.72a.78.78 0 0 1-1.06.26c-2.64-1.62-6.66-2.1-9.78-1.14a.78.78 0 0 1-.46-1.5c3.56-1.08 7.98-.56 11.04 1.3a.78.78 0 0 1 .26 1.08zm.1-2.84C14.68 8.86 9.38 8.68 6.3 9.6a.94.94 0 0 1-.54-1.8c3.54-1.06 9.4-.86 13.1 1.34a.94.94 0 0 1-.94 1.64z" />
  </svg>
)

// Generic GPU icon (graphics card shape) — used for Nvidia and AMD sources
const GpuIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 6V4M10 6V4M14 6V4M18 6V4" />
  </svg>
)

// Generic gamepad icon — no trademarked shapes
const GamepadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M6 11h4M8 9v4" />
    <line x1="15" y1="12" x2="15.01" y2="12" strokeWidth="2" />
    <line x1="18" y1="10" x2="18.01" y2="10" strokeWidth="2" />
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1.09 0 2.09-.68 3.28-2.13L9.28 15h5.44l1 1.87C16.91 18.32 17.91 19 19 19a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.152A4 4 0 0 0 17.32 5z" />
  </svg>
)

// Flame icon — for Fire TV / Amazon devices
const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

// Airplay icon — for Apple devices
const AirplayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
    <polygon points="12 15 17 21 7 21 12 15" />
  </svg>
)

// Default icon map by source code
const SOURCE_ICONS: Record<string, React.ReactNode> = {
  GAME: <GamepadIcon />, BD: '📀', TV: '📺', 'SAT/CBL': '📡', MPLAY: '▶️',
  NET: '🌐', BT: <BluetoothIcon />, AUX1: '🖥️', AUX2: '🔌', CD: '💿',
  TUNER: '📻', PHONO: '🎵', DVD: '📀', USB: '💾', 'USB/IPOD': '💾',
  SPOTIFY: <SpotifyIcon />, PANDORA: '🎵', SIRIUSXM: '📻', HDRADIO: '📻',
  IRADIO: '📻', SERVER: '🖥️', FAVORITES: '⭐',
}

// Name-based icon overrides — matches display name keywords (case-insensitive)
const NAME_ICON_RULES: { match: RegExp; icon: React.ReactNode }[] = [
  { match: /geforce|rtx|gtx|nvidia/i,            icon: <GpuIcon color="#76b900" /> },
  { match: /radeon|amd/i,                         icon: <GpuIcon color="#ed1c24" /> },
  { match: /nintendo|switch/i,                    icon: <GamepadIcon /> },
  { match: /playstation|ps[345]/i,                icon: <GamepadIcon /> },
  { match: /xbox/i,                               icon: <GamepadIcon /> },
  { match: /fire\s?tv|amazon|firestick/i,         icon: <FlameIcon /> },
  { match: /apple\s?tv|airplay|homepod/i,         icon: <AirplayIcon /> },
  { match: /chromecast|google/i,                  icon: '📡' },
  { match: /roku/i,                               icon: '📺' },
]

/** Resolve icon: check display name first, fall back to source code map. */
function getIcon(code: string, name?: string): React.ReactNode {
  if (name) {
    for (const rule of NAME_ICON_RULES) {
      if (rule.match.test(name)) return rule.icon
    }
  }
  return SOURCE_ICONS[code] || '🔊'
}

const DEFAULT_SOURCES: Record<string, string> = {
  PHONO: 'Phono', CD: 'CD', TUNER: 'Tuner', DVD: 'DVD', BD: 'Blu-ray',
  TV: 'TV Audio', 'SAT/CBL': 'SAT/Cable', MPLAY: 'Media Player',
  GAME: 'Game', NET: 'Online Music', BT: 'Bluetooth',
  AUX1: 'AUX1', AUX2: 'AUX2',
}

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  sources: SourceEntry[]
  sourceNameMap?: Record<string, string>
  sourceNameOverrides?: Record<string, string>
  radioFavorites?: RadioFavorite[]
  onRenameSource?: (code: string, name: string | null) => void
  onRadioFavoriteChange?: (favorite: RadioFavorite, enabled: boolean) => void
  zone?: Zone
}

export default function SourceSelector({
  state,
  sendCommand,
  sources,
  sourceNameMap,
  sourceNameOverrides = {},
  radioFavorites = [],
  onRenameSource,
  onRadioFavoriteChange,
  zone = 'main',
}: Props) {
  const current = zone === 'main' ? state?.source : state?.z2_source
  const prefix = zone === 'main' ? 'SI' : 'Z2'
  const [radioBrowserOpen, setRadioBrowserOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const longPressRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const sourceList = sources.length > 0
    ? sources
    : Object.entries(DEFAULT_SOURCES).map(([id, name]) => ({ id, name }))

  const getName = (code: string) => sourceNameMap?.[code] || DEFAULT_SOURCES[code] || code
  const getDefaultName = (code: string) => {
    const discovered = sources.find(s => s.id === code)?.name
    return discovered || DEFAULT_SOURCES[code] || code
  }

  const beginEdit = (code: string) => {
    setEditingCode(code)
    setDraftName(getName(code))
  }

  const commitEdit = () => {
    if (!editingCode) return
    const trimmed = draftName.trim()
    if (trimmed) onRenameSource?.(editingCode, trimmed)
    setEditingCode(null)
    setDraftName('')
  }

  const resetName = (code: string) => {
    if (!sourceNameOverrides?.[code]) return
    onRenameSource?.(code, null)
    if (editingCode === code) {
      setEditingCode(null)
      setDraftName('')
    }
  }

  const startLongPress = (code: string) => {
    clearTimeout(longPressRef.current)
    longPressRef.current = setTimeout(() => resetName(code), 650)
  }

  const cancelLongPress = () => clearTimeout(longPressRef.current)

  // Backend resolves the actual HEOS service (Spotify, TuneIn, etc.) when source=NET
  const backendDisplayName = zone === 'main' ? state?.source_name : state?.z2_source_name
  const currentDisplayName = (current ? sourceNameOverrides?.[current] : undefined) || backendDisplayName || (current ? getName(current) : '')
  const heosServiceCode = zone === 'main' ? state?.heos_source : null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Input Source</h2>
          <button
            onClick={() => { setEditMode(v => !v); setEditingCode(null) }}
            className={`text-xs transition-colors ${editMode ? 'text-denon-gold' : 'text-denon-muted hover:text-denon-text'}`}
            title={editMode ? 'Done renaming' : 'Rename inputs'}
          >
            {editMode ? '✓' : '✏️'}
          </button>
        </div>
        {current && (
          <span className="text-xs text-denon-gold font-medium flex items-center gap-1">
            <span className="text-base">{getIcon(current, currentDisplayName)}</span>
            {currentDisplayName}
          </span>
        )}
      </div>

      {editMode && (
        <p className="text-[10px] text-denon-muted/70 mb-2">
          Click a source to rename. Use Reset to restore the receiver/default name.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sourceList.map(s => {
          const active = heosServiceCode
            ? s.id === heosServiceCode  // Highlight the specific HEOS service button
            : current === s.id
          const displayName = getName(s.id)
          const editing = editingCode === s.id
          const canReset = Boolean(sourceNameOverrides?.[s.id])
          return (
            <button
              key={s.id}
              onClick={() => editMode ? beginEdit(s.id) : sendCommand(`${prefix}${s.id}`)}
              onContextMenu={(e) => { e.preventDefault(); resetName(s.id) }}
              onPointerDown={() => startLongPress(s.id)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              className={`group relative py-3 px-3 rounded-xl text-sm font-medium transition-all duration-150 text-left overflow-hidden ${
                active
                  ? 'bg-gradient-to-br from-denon-gold/20 to-amber-500/10 text-denon-gold ring-1 ring-denon-gold/40'
                  : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface hover:scale-[1.02] active:scale-[0.98]'
              } ${editMode ? 'ring-1 ring-denon-border/40' : ''}`}
              title={editMode && canReset ? `Default: ${getDefaultName(s.id)}` : undefined}
            >
              <span className="text-base mr-1.5">{getIcon(s.id, displayName)}</span>
              {editing ? (
                <input
                  autoFocus
                  value={draftName}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') { setEditingCode(null); setDraftName('') }
                  }}
                  className="w-[calc(100%-1.5rem)] bg-denon-dark border border-denon-gold/50 rounded-lg text-xs px-2 py-1 text-denon-text"
                />
              ) : (
                <span className="text-xs pr-10">
                  {displayName}{editMode && <span className="text-denon-muted ml-1">✎</span>}
                </span>
              )}
              {editMode && canReset && !editing && (
                <span
                  onClick={(e) => { e.stopPropagation(); resetName(s.id) }}
                  className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-denon-dark/80 text-[9px] text-denon-muted hover:text-denon-gold ring-1 ring-denon-border/40"
                  title={`Reset to ${getDefaultName(s.id)}`}
                >
                  Reset
                </span>
              )}
              {active && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
              )}
              {s.id === 'IRADIO' && !editMode && (
                <span
                  onClick={(e) => { e.stopPropagation(); setRadioBrowserOpen(true) }}
                  className="absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-denon-surface/80 hover:bg-denon-gold/20 hover:text-denon-gold text-denon-muted transition-all cursor-pointer"
                  title="Browse stations"
                >
                  <RadioTowerIcon />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <RadioBrowser
        open={radioBrowserOpen}
        onClose={() => setRadioBrowserOpen(false)}
        favorites={radioFavorites}
        onFavoriteChange={onRadioFavoriteChange}
      />
    </div>
  )
}
