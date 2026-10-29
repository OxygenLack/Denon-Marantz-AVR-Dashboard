import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { getModeInfo } from '../data/soundModeInfo'
import ModeInfoPopover from './ModeInfoPopover'
import ModeInfoPanel from './ModeInfoPanel'
import ModeSignal from '../experience/ModeSignal'
import SegmentedControl from './SegmentedControl'
import type { ReceiverState, SendCommandFn, SurroundCategory, SurroundModeEntry } from '../types'

/** One button in the "Available Sound Modes" grid, from either mode source. */
interface ModeButton {
  key: string
  label: string
  playing: boolean
  hasInfo: boolean
  select: () => void
}

function normalizeModeName(name: string | undefined): string {
  return (name || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()
}

function currentModeAliases(current: string | undefined): Set<string> {
  const n = normalizeModeName(current)
  const aliases = new Set<string>([n])

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

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  /** Cycle tabs (from /device.surround_categories). */
  categories: SurroundCategory[]
  /** Mode list for receivers that don't send OPSMLALL (from /device.surround_modes). */
  fallbackModes: string[]
}

export default function SurroundMode({ state, sendCommand, categories, fallbackModes }: Props) {
  const current = state?.surround_mode
  const modeList = state?.surround_mode_list
  const hasModeList = Boolean(modeList && modeList.length > 0)

  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Info feature state */
  const [infoMode, setInfoMode] = useState(false)
  const [hoveredMode, setHoveredMode] = useState<string | null>(null)
  const [selectedInfoMode, setSelectedInfoMode] = useState<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // The card unmounts on every section switch: drop pending timers with it.
  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    clearTimeout(hoverTimerRef.current)
  }, [])

  /* Reset the 3-second auto-collapse timer */
  const resetCollapseTimer = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => setExpandedCat(null), 3000)
  }, [])

  /* Modes grouped by category */
  const modesByCategory = useMemo(() => {
    if (!hasModeList || !modeList) return {} as Record<string, SurroundModeEntry[]>
    const grouped: Record<string, SurroundModeEntry[]> = {}
    for (const m of modeList) {
      if (!grouped[m.category]) grouped[m.category] = []
      grouped[m.category].push(m)
    }
    return grouped
  }, [modeList, hasModeList])

  /* Deduplicate modes by display_name for the Available list */
  const uniqueModes = useMemo(() => {
    if (!hasModeList || !modeList) return [] as SurroundModeEntry[]
    const seen = new Map<string, SurroundModeEntry>()
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
    if (!current) return fallbackModes
    const normalizedFallbacks = new Set(fallbackModes.map(normalizeModeName))
    const hasMatch = [...currentAliases].some(alias => normalizedFallbacks.has(alias))
    return hasMatch ? fallbackModes : [current, ...fallbackModes]
  }, [current, currentAliases, fallbackModes])

  /* Check if a mode is the currently playing one */
  const isPlaying = (mode: SurroundModeEntry): boolean => {
    if (!current) return false
    const command = normalizeModeName(mode.command)
    const display = normalizeModeName(mode.display_name)
    return currentAliases.has(command) || currentAliases.has(display)
  }

  /* Click a mode button — send direct command */
  const onModeClick = (mode: SurroundModeEntry) => {
    if (mode.command) {
      sendCommand(`MS${mode.command}`)
    } else {
      sendCommand(`MS${mode.display_name.toUpperCase()}`)
    }
  }

  /* Handle cycle button click */
  const onCycleClick = (cat: SurroundCategory) => {
    resetCollapseTimer()
    setExpandedCat(cat.code)

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

  /* One list for both sources: OPSMLALL entries or the fallback names */
  const modeButtons: ModeButton[] = hasModeList
    ? uniqueModes.map(mode => ({
        key: mode.display_name,
        label: mode.display_name,
        playing: isPlaying(mode),
        hasInfo: !!getModeInfo(mode.display_name),
        select: () => onModeClick(mode),
      }))
    : fallbackModesWithCurrent.map(name => ({
        key: name,
        label: name,
        playing: currentAliases.has(normalizeModeName(name)),
        hasInfo: !!getModeInfo(name),
        select: () => sendCommand(`MS${name}`),
      }))

  /* Get the expanded category's mode list with current/next indicators */
  const expandedModes = expandedCat ? (modesByCategory[expandedCat] || []) : []
  const activeIdx = expandedModes.findIndex(m => isPlaying(m))
  const nextIdx = activeIdx >= 0 ? (activeIdx + 1) % expandedModes.length : -1

  return (
    <>
      {/* Cycle Modes */}
      <div className="card">
        <h2 className="text-sm font-medium text-denon-muted mb-3">Cycle Modes</h2>
        <SegmentedControl
          label="Cycle mode category"
          grow
          variant="soft"
          options={categories.map(cat => ({ value: cat.code, label: cat.label }))}
          value={expandedCat}
          onChange={code => {
            const cat = categories.find(c => c.code === code)
            if (cat) onCycleClick(cat)
          }}
        />

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
          {modeButtons.map(mode => (
            <button
              key={mode.key}
              ref={el => { buttonRefs.current[mode.key] = el }}
              aria-pressed={mode.playing}
              onClick={() => {
                if (infoMode && mode.hasInfo) {
                  setSelectedInfoMode(prev => prev === mode.key ? null : mode.key)
                } else {
                  mode.select()
                }
              }}
              onMouseEnter={() => {
                if (mode.hasInfo) {
                  hoverTimerRef.current = setTimeout(() => setHoveredMode(mode.key), 300)
                }
              }}
              onMouseLeave={() => {
                clearTimeout(hoverTimerRef.current)
                setHoveredMode(null)
              }}
              className={`group relative py-2.5 px-3 rounded-xl text-xs font-medium transition-all text-left overflow-hidden ${
                mode.playing
                  ? 'bg-gradient-to-br from-denon-gold/20 to-amber-500/10 text-denon-gold ring-1 ring-denon-gold/40'
                  : infoMode && mode.hasInfo
                    ? 'bg-denon-surface/70 text-denon-text ring-1 ring-denon-gold/20 hover:ring-denon-gold/40 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-denon-surface/70 text-denon-text hover:bg-denon-surface hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {mode.label}
              {mode.playing && !infoMode && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-denon-gold" />
              )}
              {infoMode && mode.hasInfo && (
                <span className="absolute top-1 right-1.5 text-[8px] text-denon-muted">ⓘ</span>
              )}
            </button>
          ))}
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
