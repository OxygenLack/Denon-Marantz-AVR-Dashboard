import { useState, useEffect, memo } from 'react'
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
import AmbientBackground from './experience/AmbientBackground'
import SeasonalEffects from './experience/SeasonalEffects'
import ShortcutOverlay from './experience/ShortcutOverlay'
import type { Zone, ThemeName, UiEffects, RadioFavorite } from './types'
import type { NightModeConfigState } from './components/NightModeModal'

type Section = 'controls' | 'speakers' | 'audio'

// Fallback channel names if API hasn't loaded yet
const FALLBACK_CHANNEL_NAMES: Record<string, string> = {
  FL: 'Front L', FR: 'Front R', C: 'Center', SW: 'Subwoofer',
  SW2: 'Sub 2', SL: 'Surround L', SR: 'Surround R',
  SBL: 'SB Left', SBR: 'SB Right', SB: 'SB',
  FHL: 'Height L', FHR: 'Height R',
  FWL: 'Wide L', FWR: 'Wide R',
  TFL: 'Top F.L', TFR: 'Top F.R', TML: 'Top M.L', TMR: 'Top M.R',
  TRL: 'Top R.L', TRR: 'Top R.R',
}

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
  const { post } = useApi()
  const [zone, setZone] = useState<Zone>('main')
  useForegroundEffects()
  useKeyboardShortcuts({ state, post, sendCommand, zone, setZone })
  const [activeSection, setActiveSection] = useState<Section>('controls')
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('gold')

  // Apply theme whenever device info loads. Server-persisted theme is the default;
  // localStorage remains a browser-local override for users who want it.
  useEffect(() => {
    const t = getTheme(info?.theme)
    applyTheme(t)
    setCurrentTheme(t)
  }, [info?.theme])

  // Live theme sync: the backend includes the persisted theme in every WebSocket
  // state push and re-broadcasts on save, so a theme change on one device applies
  // on all connected devices without a reload.
  useEffect(() => {
    if (!state?.theme) return
    const t = getTheme(state.theme)
    applyTheme(t)
    setCurrentTheme(t)
  }, [state?.theme])

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
    const reason = info?.receiver_ip === '0.0.0.0' ? 'no_host' : 'connect_failed'
    return <ReceiverSetup reason={reason} onConnect={() => window.location.reload()} currentTheme={currentTheme} onThemeChange={setCurrentTheme} />
  }

  // Connected
  const deviceName = info?.device_name || 'Denon AVR'
  const zoneName = info?.zone1_name || 'Main Zone'
  const z2Name = info?.zone2_name || 'Zone 2'
  const channelNames = (info?.channel_names && Object.keys(info.channel_names).length > 0)
    ? info.channel_names
    : FALLBACK_CHANNEL_NAMES
  const sourceNameMap = info?.source_name_map || {}
  const sourceNameOverrides = info?.source_name_overrides || {}
  const configuredSources = info?.sources || []
  const radioFavorites = info?.radio_favorites || []
  const uiEffects: Partial<UiEffects> = info?.ui_effects || {}

  const saveNightModeConfig = async (config: NightModeConfigState): Promise<void> => {
    const res = await fetch('/api/v1/night-mode/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.ok) reloadDeviceInfo()
    else console.warn('Night mode config save failed', await res.text().catch(() => res.statusText))
  }

  const saveRadioFavorite = async (favorite: RadioFavorite, enabled: boolean): Promise<void> => {
    const res = enabled
      ? await fetch('/api/v1/media/radio/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(favorite),
        })
      : await fetch(`/api/v1/media/radio/favorites/${encodeURIComponent(favorite.mid)}`, { method: 'DELETE' })
    if (res.ok) reloadDeviceInfo()
    else console.warn('Radio favorite update failed', await res.text().catch(() => res.statusText))
  }

  const renameSource = async (code: string, name: string | null): Promise<void> => {
    const res = name == null
      ? await fetch(`/api/v1/source-names/${encodeURIComponent(code)}`, { method: 'DELETE' })
      : await fetch(`/api/v1/source-names/${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
    if (res.ok) reloadDeviceInfo()
    else console.warn('Source rename failed', await res.text().catch(() => res.statusText))
  }

  const mainSections: { id: Section; label: string }[] = [
    { id: 'controls', label: 'Controls' },
    { id: 'speakers', label: 'Speakers' },
    { id: 'audio', label: 'Audio / EQ' },
  ]

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
        receiverIp={info?.receiver_ip}
        info={info}
        post={post}
        currentTheme={currentTheme}
        onThemeChange={setCurrentTheme}
        onNightModeConfigChange={saveNightModeConfig}
      />

      {/* Zone Selector (desktop; mobile uses the bottom nav) */}
      <div className="hidden sm:flex gap-0 mb-5 bg-denon-card/50 rounded-2xl p-1.5 border border-denon-border/50 backdrop-blur-sm">
        <button
          onClick={() => setZone('main')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            zone === 'main'
              ? 'bg-gradient-to-r from-denon-gold to-amber-500 text-denon-dark shadow-lg shadow-denon-gold/25'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            {zoneName}
          </span>
        </button>
        <button
          onClick={() => setZone('zone2')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            zone === 'zone2'
              ? 'bg-gradient-to-r from-denon-gold to-amber-500 text-denon-dark shadow-lg shadow-denon-gold/25'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
            {z2Name}
          </span>
        </button>
      </div>

      {/* Main Zone */}
      {zone === 'main' && (
        <>
          {/* Section tabs (desktop; mobile uses the bottom nav) */}
          <div className="hidden sm:flex gap-1 mb-4">
            {mainSections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeSection === s.id
                    ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
                    : 'text-denon-muted hover:text-denon-text'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 fade-in" key={activeSection}>
            {activeSection === 'controls' && (
              <>
                <MemoPowerControl state={state} sendCommand={sendCommand} zone="main" />
                <MemoVolumeControl state={state} sendCommand={sendCommand} post={post} />
                <MemoMediaControls state={state} sendCommand={sendCommand} post={post} />
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
                <SurroundMode state={state} sendCommand={sendCommand} />
              </>
            )}

            {activeSection === 'speakers' && (
              <>
                <MemoChannelLevels
                  channels={state.channel_volumes || {}}
                  channelNames={channelNames}
                  sendCommand={sendCommand}
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
            sources={configuredSources}
            sourceNameMap={sourceNameMap}
            sourceNameOverrides={sourceNameOverrides}
            radioFavorites={radioFavorites}
            onRenameSource={renameSource}
            onRadioFavoriteChange={saveRadioFavorite}
            zoneName={z2Name}
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
        {/* Zone toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setZone('main')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              zone === 'main'
                ? 'bg-gradient-to-r from-denon-gold to-amber-500 text-denon-dark'
                : 'text-denon-muted hover:text-denon-text'
            }`}
          >
            {zoneName}
          </button>
          <button
            onClick={() => setZone('zone2')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              zone === 'zone2'
                ? 'bg-gradient-to-r from-denon-gold to-amber-500 text-denon-dark'
                : 'text-denon-muted hover:text-denon-text'
            }`}
          >
            {z2Name}
          </button>
        </div>
        {/* Section tabs (main zone only) */}
        {zone === 'main' && (
          <div className="flex gap-1">
            {mainSections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeSection === s.id
                    ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
                    : 'text-denon-muted hover:text-denon-text'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
    </>
  )
}
