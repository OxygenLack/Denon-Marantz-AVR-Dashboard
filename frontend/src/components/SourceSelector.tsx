import { useState } from 'react'
import { motion } from 'framer-motion'
import RadioBrowser from './RadioBrowser'
import type { ReceiverState, SendCommandFn, Zone, SourceEntry } from '../types'

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

const GpuIcon = ({ color = 'currentColor' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 6V4M10 6V4M14 6V4M18 6V4" />
  </svg>
)

const GamepadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M6 11h4M8 9v4" />
    <line x1="15" y1="12" x2="15.01" y2="12" strokeWidth="2" />
    <line x1="18" y1="10" x2="18.01" y2="10" strokeWidth="2" />
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1.09 0 2.09-.68 3.28-2.13L9.28 15h5.44l1 1.87C16.91 18.32 17.91 19 19 19a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.152A4 4 0 0 0 17.32 5z" />
  </svg>
)

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const AirplayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" className="inline w-4 h-4 align-text-bottom">
    <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
    <polygon points="12 15 17 21 7 21 12 15" />
  </svg>
)

type IconNode = React.ReactNode | string

const SOURCE_ICONS: Record<string, IconNode> = {
  GAME: <GamepadIcon />, BD: '📀', TV: '📺', 'SAT/CBL': '📡', MPLAY: '▶️',
  NET: '🌐', BT: <BluetoothIcon />, AUX1: '🖥️', AUX2: '🔌', CD: '💿',
  TUNER: '📻', PHONO: '🎵', DVD: '📀', USB: '💾', 'USB/IPOD': '💾',
  SPOTIFY: <SpotifyIcon />, PANDORA: '🎵', SIRIUSXM: '📻', HDRADIO: '📻',
  IRADIO: '📻', SERVER: '🖥️', FAVORITES: '⭐',
}

const NAME_ICON_RULES: { match: RegExp; icon: IconNode }[] = [
  { match: /geforce|rtx|gtx|nvidia/i, icon: <GpuIcon color="#76b900" /> },
  { match: /radeon|amd/i,             icon: <GpuIcon color="#ed1c24" /> },
  { match: /nintendo|switch/i,        icon: <GamepadIcon /> },
  { match: /playstation|ps[345]/i,    icon: <GamepadIcon /> },
  { match: /xbox/i,                   icon: <GamepadIcon /> },
  { match: /fire\s?tv|amazon|firestick/i, icon: <FlameIcon /> },
  { match: /apple\s?tv|airplay|homepod/i, icon: <AirplayIcon /> },
  { match: /chromecast|google/i,      icon: '📡' },
  { match: /roku/i,                   icon: '📺' },
]

function getIcon(code: string, name?: string): IconNode {
  if (name) {
    for (const rule of NAME_ICON_RULES) {
      if (rule.match.test(name)) return rule.icon
    }
  }
  return SOURCE_ICONS[code] ?? '🔊'
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
  sourceNameMap: Record<string, string>
  zone?: Zone
}

export default function SourceSelector({ state, sendCommand, sources, sourceNameMap, zone = 'main' }: Props) {
  const current = zone === 'main' ? state.source : state.z2_source
  const prefix = zone === 'main' ? 'SI' : 'Z2'
  const [radioBrowserOpen, setRadioBrowserOpen] = useState(false)

  const sourceList: SourceEntry[] = sources.length > 0
    ? sources
    : Object.entries(DEFAULT_SOURCES).map(([id, name]) => ({ id, name }))

  const getName = (code: string) => sourceNameMap[code] ?? DEFAULT_SOURCES[code] ?? code

  const currentDisplayName = (zone === 'main' ? state.source_name : state.z2_source_name) ?? getName(current ?? '')
  const heosServiceCode = zone === 'main' ? state.heos_source : null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider">Input Source</h2>
        {current && (
          <span className="text-xs text-denon-gold font-medium flex items-center gap-1">
            <span className="text-base">{getIcon(current, currentDisplayName)}</span>
            {currentDisplayName}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {sourceList.map(s => {
          const active = heosServiceCode ? s.id === heosServiceCode : current === s.id
          return (
            <motion.button
              key={s.id}
              onClick={() => sendCommand(`${prefix}${s.id}`)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`group relative py-3 px-3 rounded-xl text-sm font-medium transition-all duration-150 text-left overflow-hidden ${
                active
                  ? 'bg-denon-gold/15 text-denon-gold ring-1 ring-denon-gold/40'
                  : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface'
              }`}
            >
              <span className="text-base mr-1.5">{getIcon(s.id, s.name)}</span>
              <span className="text-xs">{s.name}</span>
              {active && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />}
              {s.id === 'IRADIO' && (
                <motion.span
                  onClick={(e) => { e.stopPropagation(); setRadioBrowserOpen(true) }}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.88 }}
                  className="absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-denon-surface/80 hover:bg-denon-gold/20 hover:text-denon-gold text-denon-muted transition-all cursor-pointer"
                  title="Browse stations"
                >
                  <RadioTowerIcon />
                </motion.span>
              )}
            </motion.button>
          )
        })}
      </div>
      <RadioBrowser open={radioBrowserOpen} onClose={() => setRadioBrowserOpen(false)} />
    </div>
  )
}
