import { useState, useEffect, useCallback, memo } from 'react'
import { getTheme, applyTheme } from './theme'
import { useWebSocket } from './hooks/useWebSocket'
import ReceiverSetup from './components/ReceiverSetup'
import { useDeviceInfo } from './hooks/useDeviceInfo'
import { useApi } from './hooks/useApi'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useForegroundEffects } from './hooks/useForegroundEffects'
import StatusBar from './components/StatusBar'
import PowerControl from './components/PowerControl'
import VolumeControl from './components/VolumeControl'
import SourceSelector from './components/SourceSelector'
import SurroundMode from './components/SurroundMode'
import ChannelLevels from './components/ChannelLevels'
import ToneControls from './components/ToneControls'
import SubwooferLevel from './components/SubwooferLevel'
import AudioSettings from './components/AudioSettings'
import MediaControls from './components/MediaControls'
import Zone2Controls from './components/Zone2Controls'
import CacheReset from './components/CacheReset'
import ZoneTabs from './components/ZoneTabs'
import SectionTabs, { type Section } from './components/SectionTabs'
import AmbientBackground from './experience/AmbientBackground'
import SeasonalEffects from './experience/SeasonalEffects'
import ShortcutOverlay from './experience/ShortcutOverlay'
import type { Zone, ThemeName, UiEffects, RadioFavorite, NightModeConfig, ApiResponse, SourceEntry, SurroundCategory } from './types'

// Stable empty fallbacks, so memoized children do not re-render on every push
const EMPTY_MAP: Record<string, string> = {}
const EMPTY_LEVELS: Record<string, number> = {}
const EMPTY_SOURCES: SourceEntry[] = []
const EMPTY_FAVORITES: RadioFavorite[] = []
const EMPTY_LIST: string[] = []
const EMPTY_CATEGORIES: SurroundCategory[] = []
const EMPTY_EFFECTS: Partial<UiEffects> = {}

// Memoize heavy child components to avoid re-renders on every WebSocket push
const MemoChannelLevels = memo(ChannelLevels)
const MemoAudioSettings = memo(AudioSettings)
const MemoSourceSelector = memo(SourceSelector)
const MemoVolumeControl = memo(VolumeControl)
const MemoPowerControl = memo(PowerControl)
const MemoStatusBar = memo(StatusBar)
const MemoMediaControls = memo(MediaControls)

export default function App() {
  const { state, wsConnected, wsConnecting, sendCommand } = useWebSocket()
  const { info, reload: reloadDeviceInfo } = useDeviceInfo()
  const { post, del } = useApi()
  const [zone, setZone] = useState<Zone>('main')
  useForegroundEffects()
  useKeyboardShortcuts({ state, post, sendCommand, zone, setZone })
  const [activeSection, setActiveSection] = useState<Section>('controls')
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('gold')

  // Theme: the server-persisted theme wins (it rides on every WebSocket push and
  // is re-broadcast on save, so a change on one device applies everywhere);
  // /device covers the time before the first push. localStorage is only the
  // fallback when the server has none (see getTheme).
  const serverTheme = state?.theme ?? info?.theme
  useEffect(() => {
    const t = getTheme(serverTheme)
    applyTheme(t)
    setCurrentTheme(t)
  }, [serverTheme])

  const saveNightModeConfig = useCallback(async (config: NightModeConfig): Promise<ApiResponse> => {
    const res = await post('/night-mode/config', config)
    if (res.ok) await reloadDeviceInfo()
    return res
  }, [post, reloadDeviceInfo])

  const saveRadioFavorite = useCallback(async (favorite: RadioFavorite, enabled: boolean): Promise<ApiResponse> => {
    const res = enabled
      ? await post('/media/radio/favorites', favorite)
      : await del(`/media/radio/favorites/${encodeURIComponent(favorite.mid)}`)
    if (res.ok) await reloadDeviceInfo()
    return res
  }, [post, del, reloadDeviceInfo])

  const renameSource = useCallback(async (code: string, name: string | null): Promise<ApiResponse> => {
    const path = `/source-names/${encodeURIComponent(code)}`
    const res = name == null ? await del(path) : await post(path, { name })
    if (res.ok) await reloadDeviceInfo()
    return res
  }, [post, del, reloadDeviceInfo])

  // Loading — waiting for first WebSocket message
  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-denon-dark">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-denon-gold/30 border-t-denon-gold rounded-full animate-spin mx-auto mb-4" />
          <p className="text-denon-muted text-sm">Connecting…</p>
          <p className="text-denon-muted/50 text-xs mt-2">If this stays here, hard refresh once to clear old cached app files.</p>
        </div>
      </div>
    )
  }

  // Actively discovering — show spinner (backend will push state update when done)
  if (!state.connected && state.discovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-denon-dark p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-denon-card border border-denon-border flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-denon-gold animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div>
            <p className="text-denon-text font-semibold">Searching for receiver…</p>
            <p className="text-denon-muted text-sm mt-1">Scanning your network for Denon / Marantz AVRs</p>
          </div>
          <div className="flex justify-center gap-1.5 pt-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-denon-gold animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Discovery finished but no receiver found — show setup screen
  if (!state.connected) {
    // /device reports the configured-or-connected host, null when there is none.
    const reason = info?.receiver_ip ? 'connect_failed' : 'no_host'
    return <ReceiverSetup reason={reason} onConnect={() => window.location.reload()} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />
  }

  // Connected
  const deviceName = info?.device_name || 'Denon AVR'
  const zoneName = info?.zone1_name || 'Main Zone'
  const z2Name = info?.zone2_name || 'Zone 2'
  // Canonical speaker order and names come from /device (empty until loaded).
  const channelNames = info?.channel_names ?? EMPTY_MAP
  // Lists render only once /device has loaded; there is no built-in fallback.
  const mediaSources = info?.media_sources ?? EMPTY_LIST
  const surroundCategories = info?.surround_categories ?? EMPTY_CATEGORIES
  const surroundModes = info?.surround_modes ?? EMPTY_LIST
  const sourceNameMap = info?.source_name_map ?? EMPTY_MAP
  const sourceNameOverrides = info?.source_name_overrides ?? EMPTY_MAP
  const configuredSources = info?.sources ?? EMPTY_SOURCES
  const radioFavorites = info?.radio_favorites ?? EMPTY_FAVORITES
  const uiEffects: Partial<UiEffects> = info?.ui_effects ?? EMPTY_EFFECTS

  return (
    <>
    {uiEffects.ambient_background !== false && (
      <AmbientBackground state={state} intensity={uiEffects.ambient_intensity ?? 1} />
    )}
    <SeasonalEffects mode={uiEffects.seasonal_effects || 'auto'} />
    {uiEffects.shortcut_overlay !== false && <ShortcutOverlay />}
    <CacheReset />
    <div className={`relative z-10 max-w-2xl mx-auto px-4 pb-24 sm:pb-8 min-h-screen ${uiEffects.card_animations === false ? 'no-card-animations' : ''}`}>
      {/* Header + Health */}
      <MemoStatusBar
        deviceName={deviceName}
        state={state}
        wsConnected={wsConnected}
        wsConnecting={wsConnecting}
        info={info}
        post={post}
        currentTheme={currentTheme}
        onThemeChange={setCurrentTheme}
        onNightModeConfigChange={saveNightModeConfig}
      />

      {/* Zone Selector (desktop; mobile uses the bottom nav) */}
      <div className="hidden sm:block">
        <ZoneTabs zone={zone} onChange={setZone} mainName={zoneName} zone2Name={z2Name} />
      </div>

      {/* Main Zone */}
      {zone === 'main' && (
        <>
          {/* Section tabs (desktop; mobile uses the bottom nav) */}
          <div className="hidden sm:block">
            <SectionTabs section={activeSection} onChange={setActiveSection} />
          </div>

          <div className="space-y-4 fade-in" key={activeSection}>
            {activeSection === 'controls' && (
              <>
                <MemoPowerControl state={state} sendCommand={sendCommand} zone="main" />
                <MemoVolumeControl state={state} sendCommand={sendCommand} post={post} />
                <MemoMediaControls state={state} post={post} mediaSources={mediaSources} />
                <MemoSourceSelector
                  state={state}
                  sendCommand={sendCommand}
                  sources={configuredSources}
                  sourceNameMap={sourceNameMap}
                  sourceNameOverrides={sourceNameOverrides}
                  radioFavorites={radioFavorites}
                  onRenameSource={renameSource}
                  onRadioFavoriteChange={saveRadioFavorite}
                />
                <SurroundMode
                  state={state}
                  sendCommand={sendCommand}
                  categories={surroundCategories}
                  fallbackModes={surroundModes}
                />
              </>
            )}

            {activeSection === 'speakers' && (
              <>
                <MemoChannelLevels
                  channels={state.channel_volumes ?? EMPTY_LEVELS}
                  channelNames={channelNames}
                  post={post}
                  calibration={state.speaker_calibration}
                />
                <SubwooferLevel state={state} post={post} />
              </>
            )}

            {activeSection === 'audio' && (
              <>
                <ToneControls state={state} post={post} />
                <MemoAudioSettings state={state} post={post} />
              </>
            )}
          </div>
        </>
      )}

      {/* Zone 2 */}
      {zone === 'zone2' && (
        <div className="fade-in">
          <Zone2Controls
            state={state}
            sendCommand={sendCommand}
            post={post}
            mediaSources={mediaSources}
            sources={configuredSources}
            sourceNameMap={sourceNameMap}
            sourceNameOverrides={sourceNameOverrides}
            radioFavorites={radioFavorites}
            onRenameSource={renameSource}
            onRadioFavoriteChange={saveRadioFavorite}
          />
        </div>
      )}
    </div>

    {/* Mobile bottom navigation — thumb-reachable zone + section tabs */}
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-denon-card/95 backdrop-blur-xl border-t border-denon-border/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-2xl mx-auto px-3 pt-2 pb-2 space-y-2">
        <ZoneTabs zone={zone} onChange={setZone} mainName={zoneName} zone2Name={z2Name} compact />
        {/* Section tabs (main zone only) */}
        {zone === 'main' && (
          <SectionTabs section={activeSection} onChange={setActiveSection} compact />
        )}
      </div>
    </nav>
    </>
  )
}
