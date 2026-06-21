import { useState, useMemo, useRef, useCallback } from 'react'
import { getModeInfo } from '../data/soundModeInfo'
import ModeInfoPopover from './ModeInfoPopover'
import ModeInfoPanel from './ModeInfoPanel'
import ModeSignal from '../experience/ModeSignal'

/* Category cycling commands */
const CATEGORIES = [
  { label: 'Movie', command: 'MOVIE', code: 'MOV' },
  { label: 'Music', command: 'MUSIC', code: 'MUS' },
  { label: 'Game',  command: 'GAME',  code: 'GAM' },
  { label: 'Pure',  command: 'DIRECT', code: 'PUR' },
]

/* Fallback modes for receivers that don't send OPSMLALL */
const FALLBACK_MODES = [
  'STEREO', 'DIRECT', 'PURE DIRECT',
  'DOLBY SURROUND', 'DOLBY DIGITAL', 'DOLBY ATMOS',
  'DTS SURROUND', 'DTS:X', 'MCH STEREO',
  'ROCK ARENA', 'JAZZ CLUB', 'MONO MOVIE',
  'MATRIX', 'VIDEO GAME', 'VIRTUAL',
]

function normalizeModeName(name) {
  return (name || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()
}

function currentModeAliases(current) {
  const n = normalizeModeName(current)
  const aliases = new Set([n])

  if (n.includes('+DSUR') || n.includes('DOLBY SURROUND')) {
    aliases.add('DOLBY SURROUND')
    aliases.add('DOLBY AUDIO - DOLBY SURROUND')
    aliases.add('DOLBY AUDIO-DOLBY SURROUND')
  }
  if (n.includes('DD+') || n.includes('DOLBY DIGITAL PLUS')) {
    aliases.add('DOLBY DIGITAL PLUS')
    aliases.add('DOLBY AUDIO - DD+')
    aliases.add('DOLBY AUDIO-DD+')
  }
  if (n.includes('DOLBY DIGITAL') && !n.includes('PLUS')) {
    aliases.add('DOLBY DIGITAL')
    aliases.add('DOLBY AUDIO - DOLBY DIGITAL')
    aliases.add('DOLBY AUDIO-DOLBY DIGITAL')
  }
  if (n.includes('ATMOS')) aliases.add('DOLBY ATMOS')
  if (n.includes('TRUEHD')) {
    aliases.add('DOLBY TRUEHD')
    aliases.add('DOLBY AUDIO - TRUEHD')
    aliases.add('DOLBY AUDIO-TRUEHD')
  }
  if (n.includes('+NEURAL:X') || n.includes('NEURAL:X')) aliases.add('DTS NEURAL:X')
  if (n.includes('DTS:X')) aliases.add('DTS:X')
  if (n.includes('VIRTUAL:X')) aliases.add('DTS VIRTUAL:X')
  if (n.includes('DTS SURROUND')) aliases.add('DTS SURROUND')

  return aliases
}

export default function SurroundMode({ state, sendCommand }) {
  const current = state?.surround_mode
  const modeList = state?.surround_mode_list
  const hasModeList = modeList && modeList.length > 0

  const [expandedCat, setExpandedCat] = useState(null)
  const collapseTimer = useRef(null)
  const expandedRef = useRef(null) // tracks if category was already expanded

  /* Info feature state */
  const [infoMode, setInfoMode] = useState(false)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [selectedInfoMode, setSelectedInfoMode] = useState(null)
  const hoverTimerRef = useRef(null)
  const buttonRefs = useRef({})

  /* Reset the 3-second auto-collapse timer */
  const resetCollapseTimer = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => {
      setExpandedCat(null)
      expandedRef.current = null
    }, 3000)
  }, [])

  /* Modes grouped by category */
  const modesByCategory = useMemo(() => {
    if (!hasModeList) return {}
    const grouped = {}
    for (const m of modeList) {
      if (!grouped[m.category]) grouped[m.category] = []
      grouped[m.category].push(m)
    }
    return grouped
  }, [modeList, hasModeList])

  /* Deduplicate modes by display_name for the Available list */
  const uniqueModes = useMemo(() => {
    if (!hasModeList) return []
    const seen = new Map()
    for (const m of modeList) {
      const existing = seen.get(m.display_name)
      if (!existing || m.active) {
        seen.set(m.display_name, m)
      }
    }
    return [...seen.values()]
  }, [modeList, hasModeList])

  const currentAliases = useMemo(() => currentModeAliases(current), [current])

  const fallbackModesWithCurrent = useMemo(() => {
    if (!current) return FALLBACK_MODES
    const normalizedFallbacks = new Set(FALLBACK_MODES.map(normalizeModeName))
    const hasMatch = [...currentAliases].some(alias => normalizedFallbacks.has(alias))
    return hasMatch ? FALLBACK_MODES : [current, ...FALLBACK_MODES]
  }, [current, currentAliases])

  /* Check if a mode is the currently playing one */
  const isPlaying = (mode) => {
    if (!current) return false
    const command = normalizeModeName(mode.command)
    const display = normalizeModeName(mode.display_name)
    return currentAliases.has(command) || currentAliases.has(display)
  }

  /* Click a mode button — send direct command */
  const onModeClick = (mode) => {
    if (mode.command) {
      sendCommand(`MS${mode.command}`)
    } else {
      sendCommand(`MS${mode.display_name.toUpperCase()}`)
    }
  }

  /* Handle cycle button click */
  const onCycleClick = (cat) => {
    resetCollapseTimer()
    setExpandedCat(cat.code)
    expandedRef.current = cat.code

    // Always send the cycle command — the receiver handles
    // "first press = display only" behavior on its own
    if (cat.code === 'PUR') {
      // PUR doesn't cycle via telnet — toggle manually
      const purModes = modesByCategory['PUR'] || []
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

  /* Get the expanded category's mode list with current/next indicators */
  const expandedModes = expandedCat ? (modesByCategory[expandedCat] || []) : []
  const activeIdx = expandedModes.findIndex(m => isPlaying(m))
  const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % expandedModes.length : -1

  return (
    <>
      {/* Cycle Modes */}
      <div className="card">
        <h2 className="text-sm font-medium text-denon-muted mb-3">Cycle Modes</h2>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.command}
              onClick={() => onCycleClick(cat)}
              className={`py-2.5 px-3 rounded-xl text-xs font-medium transition-all ${
                expandedCat === cat.code
                  ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
                  : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Expanded cycle order */}
        {expandedCat && expandedModes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-denon-border/30">
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
                    <span className={playing ? '' : isNext ? 'text-denon-text' : ''}>
                      {mode.display_name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Available Sound Modes */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-denon-muted">Available Sound Modes</h2>
            <button
              onClick={() => { setInfoMode(m => !m); setSelectedInfoMode(null) }}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                infoMode
                  ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
                  : 'bg-denon-surface text-denon-muted hover:text-denon-text'
              }`}
              aria-label="Toggle mode info"
            >
              i
            </button>
          </div>
          {current && (
            <span className="text-xs text-denon-gold font-medium bg-denon-gold/10 px-2 py-0.5 rounded-lg">
              {current}
            </span>
          )}
        </div>
        <ModeSignal mode={current} />
        <div className="grid grid-cols-2 gap-2">
          {hasModeList ? (
            uniqueModes.map(mode => {
              const playing = isPlaying(mode)
              const hasInfo = !!getModeInfo(mode.display_name)
              return (
                <button
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
                    clearTimeout(hoverTimerRef.current)
                    setHoveredMode(null)
                  }}
                  className={`group relative py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-left overflow-hidden ${
                    playing
                      ? 'bg-gradient-to-br from-denon-gold/20 to-amber-500/10 text-denon-gold ring-1 ring-denon-gold/40'
                      : infoMode && hasInfo
                        ? 'bg-denon-surface/70 text-denon-text ring-1 ring-denon-gold/20 hover:ring-denon-gold/40 hover:scale-[1.02] active:scale-[0.98]'
                        : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {mode.display_name}
                  {playing && !infoMode && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
                  )}
                  {infoMode && hasInfo && (
                    <span className="absolute top-1 right-1.5 text-[8px] text-denon-muted">ⓘ</span>
                  )}
                </button>
              )
            })
          ) : (
            fallbackModesWithCurrent.map(modeName => {
              const playing = currentAliases.has(normalizeModeName(modeName))
              const hasInfo = !!getModeInfo(modeName)
              return (
                <button
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
                    clearTimeout(hoverTimerRef.current)
                    setHoveredMode(null)
                  }}
                  className={`group relative py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-left overflow-hidden ${
                    playing
                      ? 'bg-gradient-to-br from-denon-gold/20 to-amber-500/10 text-denon-gold ring-1 ring-denon-gold/40'
                      : infoMode && hasInfo
                        ? 'bg-denon-surface/70 text-denon-text ring-1 ring-denon-gold/20 hover:ring-denon-gold/40 hover:scale-[1.02] active:scale-[0.98]'
                        : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {modeName}
                  {playing && !infoMode && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
                  )}
                  {infoMode && hasInfo && (
                    <span className="absolute top-1 right-1.5 text-[8px] text-denon-muted">ⓘ</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Mobile info panel (shown when info mode toggle is active) */}
        {infoMode && selectedInfoMode && (
          <ModeInfoPanel
            modeName={selectedInfoMode}
            modeInfo={getModeInfo(selectedInfoMode)}
            onClose={() => setSelectedInfoMode(null)}
          />
        )}

        {/* Desktop hover popover */}
        {hoveredMode && !infoMode && (
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
