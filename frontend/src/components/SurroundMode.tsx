import { useState, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeInUp, FAST } from '../variants'
import { getModeInfo } from '../data/soundModeInfo'
import ModeInfoPopover from './ModeInfoPopover'
import ModeInfoPanel from './ModeInfoPanel'
import type { ReceiverState, SendCommandFn, SurroundModeEntry as ModeEntry } from '../types'

interface Category {
  label: string
  command: string
  code: string
}

const CATEGORIES: Category[] = [
  { label: 'Movie', command: 'MOVIE', code: 'MOV' },
  { label: 'Music', command: 'MUSIC', code: 'MUS' },
  { label: 'Game',  command: 'GAME',  code: 'GAM' },
  { label: 'Pure',  command: 'DIRECT', code: 'PUR' },
]

const FALLBACK_MODES = [
  'STEREO', 'DIRECT', 'PURE DIRECT',
  'DOLBY SURROUND', 'DOLBY DIGITAL', 'DOLBY ATMOS',
  'DTS SURROUND', 'DTS:X', 'MCH STEREO',
  'ROCK ARENA', 'JAZZ CLUB', 'MONO MOVIE',
  'MATRIX', 'VIDEO GAME', 'VIRTUAL',
]

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
}

export default function SurroundMode({ state, sendCommand }: Props) {
  const current = state.surround_mode
  const modeList = state.surround_mode_list
  const hasModeList = modeList != null && modeList.length > 0

  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandedRef = useRef<string | null>(null)

  const [infoMode, setInfoMode] = useState(false)
  const [hoveredMode, setHoveredMode] = useState<string | null>(null)
  const [selectedInfoMode, setSelectedInfoMode] = useState<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const resetCollapseTimer = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      setExpandedCat(null)
      expandedRef.current = null
    }, 3000)
  }, [])

  const modesByCategory = useMemo(() => {
    if (!hasModeList || !modeList) return {} as Record<string, ModeEntry[]>
    const grouped: Record<string, ModeEntry[]> = {}
    for (const m of modeList) {
      if (!grouped[m.category]) grouped[m.category] = []
      grouped[m.category].push(m)
    }
    return grouped
  }, [modeList, hasModeList])

  const uniqueModes = useMemo(() => {
    if (!hasModeList || !modeList) return []
    const seen = new Map<string, ModeEntry>()
    for (const m of modeList) {
      const existing = seen.get(m.display_name)
      if (!existing || m.active) {
        seen.set(m.display_name, m)
      }
    }
    return [...seen.values()]
  }, [modeList, hasModeList])

  const isPlaying = (mode: ModeEntry) => {
    if (!current) return false
    if (mode.command === current) return true
    if (mode.display_name?.toUpperCase() === current) return true
    return false
  }

  const onModeClick = (mode: ModeEntry) => {
    if (mode.command) {
      sendCommand(`MS${mode.command}`)
    } else {
      sendCommand(`MS${mode.display_name.toUpperCase()}`)
    }
  }

  const onCycleClick = (cat: Category) => {
    resetCollapseTimer()
    setExpandedCat(cat.code)
    expandedRef.current = cat.code

    if (cat.code === 'PUR') {
      const purModes = modesByCategory['PUR'] ?? []
      const activeIdx = purModes.findIndex(m => isPlaying(m))
      const nextMode = purModes[(activeIdx + 1) % purModes.length]
      if (nextMode?.command) {
        sendCommand(`MS${nextMode.command}`)
      } else {
        sendCommand(`MS${cat.command}`)
      }
    } else {
      sendCommand(`MS${cat.command}`)
    }
  }

  const expandedModes = expandedCat ? (modesByCategory[expandedCat] ?? []) : []
  const activeIdx = expandedModes.findIndex(m => isPlaying(m))
  const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % expandedModes.length : -1

  return (
    <>
      <div className="card">
        <h2 className="text-sm font-medium text-denon-muted mb-3">Cycle Modes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CATEGORIES.map(cat => (
            <motion.button
              key={cat.command}
              onClick={() => onCycleClick(cat)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                expandedCat === cat.code
                  ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
                  : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface'
              }`}
            >
              {cat.label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {expandedCat != null && expandedModes.length > 0 && (
            <motion.div
              key="expanded-modes"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={FAST}
              className="mt-3 pt-3 border-t border-denon-border/30"
            >
              <div className="space-y-1">
                {expandedModes.map((mode, idx) => {
                  const playing = isPlaying(mode)
                  const isNext = idx === nextIdx
                  return (
                    <div
                      key={`${mode.category}${mode.id}`}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-xs transition-all ${
                        playing
                          ? 'bg-denon-gold/15 text-denon-gold font-medium'
                          : isNext
                            ? 'bg-denon-surface/50 text-denon-text'
                            : 'text-denon-muted'
                      }`}
                    >
                      <span className="w-4 text-center shrink-0">
                        {playing ? '▸' : isNext ? '→' : ''}
                      </span>
                      <span>{mode.display_name}</span>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-denon-muted">Available Sound Modes</h2>
            <motion.button
              onClick={() => { setInfoMode(m => !m); setSelectedInfoMode(null) }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                infoMode
                  ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
                  : 'bg-denon-surface text-denon-muted hover:text-denon-text'
              }`}
              aria-label="Toggle mode info"
            >
              i
            </motion.button>
          </div>
          {current && (
            <span className="text-xs text-denon-gold font-medium bg-denon-gold/10 px-2 py-0.5 rounded-lg">
              {current}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {hasModeList ? (
            uniqueModes.map(mode => {
              const playing = isPlaying(mode)
              const hasInfo = !!getModeInfo(mode.display_name)
              return (
                <motion.button
                  key={mode.display_name}
                  ref={el => { buttonRefs.current[mode.display_name] = el }}
                  onClick={() => {
                    if (infoMode && hasInfo) {
                      setSelectedInfoMode(prev => prev === mode.display_name ? null : mode.display_name)
                    } else {
                      onModeClick(mode)
                    }
                  }}
                  onMouseEnter={() => {
                    if (hasInfo) {
                      hoverTimerRef.current = setTimeout(() => setHoveredMode(mode.display_name), 300)
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                    setHoveredMode(null)
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`group relative py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-left overflow-hidden ${
                    playing
                      ? 'bg-denon-gold/15 text-denon-gold ring-1 ring-denon-gold/40'
                      : infoMode && hasInfo
                        ? 'bg-denon-surface/70 text-denon-text ring-1 ring-denon-gold/20 hover:ring-denon-gold/40'
                        : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface'
                  }`}
                >
                  {mode.display_name}
                  {playing && !infoMode && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
                  )}
                  {infoMode && hasInfo && (
                    <span className="absolute top-1 right-1.5 text-[8px] text-denon-muted">ⓘ</span>
                  )}
                </motion.button>
              )
            })
          ) : (
            FALLBACK_MODES.map(modeName => {
              const playing = current === modeName
              const hasInfo = !!getModeInfo(modeName)
              return (
                <motion.button
                  key={modeName}
                  ref={el => { buttonRefs.current[modeName] = el }}
                  onClick={() => {
                    if (infoMode && hasInfo) {
                      setSelectedInfoMode(prev => prev === modeName ? null : modeName)
                    } else {
                      sendCommand(`MS${modeName}`)
                    }
                  }}
                  onMouseEnter={() => {
                    if (hasInfo) {
                      hoverTimerRef.current = setTimeout(() => setHoveredMode(modeName), 300)
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                    setHoveredMode(null)
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`group relative py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-left overflow-hidden ${
                    playing
                      ? 'bg-gradient-to-br from-denon-gold/20 to-amber-500/10 text-denon-gold ring-1 ring-denon-gold/40'
                      : infoMode && hasInfo
                        ? 'bg-denon-surface/70 text-denon-text ring-1 ring-denon-gold/20 hover:ring-denon-gold/40'
                        : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface'
                  }`}
                >
                  {modeName}
                  {playing && !infoMode && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
                  )}
                  {infoMode && hasInfo && (
                    <span className="absolute top-1 right-1.5 text-[8px] text-denon-muted">ⓘ</span>
                  )}
                </motion.button>
              )
            })
          )}
        </div>

        <AnimatePresence>
          {infoMode && selectedInfoMode && (
            <motion.div
              key="info-panel"
              variants={fadeInUp}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={FAST}
            >
              <ModeInfoPanel
                modeName={selectedInfoMode}
                modeInfo={getModeInfo(selectedInfoMode)}
                onClose={() => setSelectedInfoMode(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {hoveredMode != null && !infoMode && (
          <ModeInfoPopover
            modeName={hoveredMode}
            modeInfo={getModeInfo(hoveredMode)}
            anchorEl={buttonRefs.current[hoveredMode]}
          />
        )}
      </div>
    </>
  )
}
