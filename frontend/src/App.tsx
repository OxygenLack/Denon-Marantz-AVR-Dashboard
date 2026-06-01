import { useState, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { applyThemeConfig } from './theme'
import { useWebSocket } from './hooks/useWebSocket'
import ReceiverSetup from './components/ReceiverSetup'
import AndroidTvRemote from './components/AndroidTvRemote'
import { useDeviceInfo } from './hooks/useDeviceInfo'
import { useApi } from './hooks/useApi'
import StatusBar from './components/StatusBar'
import PowerControl from './components/PowerControl'
import VolumeControl from './components/VolumeControl'
import MediaControls from './components/MediaControls'
import SourceSelector from './components/SourceSelector'
import SurroundMode from './components/SurroundMode'
import ChannelLevels from './components/ChannelLevels'
import ToneControls from './components/ToneControls'
import SubwooferLevel from './components/SubwooferLevel'
import AudioSettings from './components/AudioSettings'
import Zone2Controls from './components/Zone2Controls'
import ThemeModal from './components/ThemeModal'
import { fadeInUp, FAST, SPIN, BOUNCE } from './variants'
import type { SourceEntry } from './types'

const MemoAndroidTvRemote = memo(AndroidTvRemote)

interface NavTabProps {
  icon: React.ReactNode
  label: string
  active: boolean
  dim?: boolean
  onClick: () => void
}

function NavTab({ icon, label, active, dim, onClick }: NavTabProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-w-0 transition-colors ${
        active ? 'text-denon-gold' : dim ? 'text-denon-muted/30' : 'text-denon-muted hover:text-denon-text'
      }`}
    >
      {icon}
      <span className="text-[9px] font-medium leading-none truncate px-0.5">{label}</span>
    </motion.button>
  )
}

const FALLBACK_CHANNEL_NAMES: Record<string, string> = {
  FL: 'Front L', FR: 'Front R', C: 'Center', SW: 'Subwoofer',
  SW2: 'Sub 2', SL: 'Surround L', SR: 'Surround R',
  SBL: 'SB Left', SBR: 'SB Right', SB: 'SB',
  FHL: 'Height L', FHR: 'Height R',
  FWL: 'Wide L', FWR: 'Wide R',
  TFL: 'Top F.L', TFR: 'Top F.R', TML: 'Top M.L', TMR: 'Top M.R',
  TRL: 'Top R.L', TRR: 'Top R.R',
}

const MemoChannelLevels = memo(ChannelLevels)
const MemoAudioSettings = memo(AudioSettings)
const MemoSourceSelector = memo(SourceSelector)
const MemoVolumeControl = memo(VolumeControl)
const MemoPowerControl = memo(PowerControl)
const MemoStatusBar = memo(StatusBar)
const MemoMediaControls = memo(MediaControls)

type ZoneTab = 'main' | 'zone2' | 'androidtv'
type Section = 'controls' | 'speakers' | 'audio'

export default function App() {
  const { state, wsConnected, sendCommand, patchState } = useWebSocket()
  const { info } = useDeviceInfo()
  const { post } = useApi()
  const [zone, setZone] = useState<ZoneTab>('main')
  const [activeSection, setActiveSection] = useState<Section>('controls')
  const [themeModalOpen, setThemeModalOpen] = useState(false)
  const [activeAndroidPanel, setActiveAndroidPanel] = useState('remote')

  useEffect(() => {
    if (state?.theme_config) applyThemeConfig(state.theme_config)
  }, [state?.theme_config])

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-denon-dark">
        <div className="text-center">
          <motion.div
            className="w-14 h-14 border-4 border-denon-gold/30 border-t-denon-gold rounded-full mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={SPIN}
          />
          <p className="text-denon-muted text-sm">Connecting…</p>
        </div>
      </div>
    )
  }

  if (!state.connected && state.discovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-denon-dark p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-denon-card border border-denon-border flex items-center justify-center mx-auto">
            <motion.svg
              className="w-8 h-8 text-denon-gold"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </motion.svg>
          </div>
          <div>
            <p className="text-denon-text font-semibold">Searching for receiver…</p>
            <p className="text-denon-muted text-sm mt-1">Scanning your network for Denon / Marantz AVRs</p>
          </div>
          <div className="flex justify-center gap-1.5 pt-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-denon-gold"
                animate={{ y: [0, -6, 0] }}
                transition={{ ...BOUNCE, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const setupReason = info?.receiver_ip === '0.0.0.0' ? 'no_host' : 'connect_failed'

  const deviceName = info?.device_name ?? 'Denon AVR'
  const zoneName = info?.zone1_name ?? 'Main Zone'
  const z2Name = info?.zone2_name ?? 'Zone 2'
  const channelNames = (info?.channel_names && Object.keys(info.channel_names).length > 0)
    ? info.channel_names
    : FALLBACK_CHANNEL_NAMES
  const sourceNameMap = info?.source_name_map ?? {}
  const configuredSources: SourceEntry[] = (info?.sources ?? []).map(item => {
    if (typeof item === 'object' && item !== null && 'id' in item) {
      return {
        id: item.id,
        name: item.name ?? sourceNameMap[item.id] ?? item.id,
      }
    }
    const id = String(item)
    return {
      id,
      name: sourceNameMap[id] ?? id,
    }
  })

  const mainSections: { id: Section; label: string }[] = [
    { id: 'controls', label: 'Controls' },
    { id: 'speakers', label: 'Speakers' },
    { id: 'audio', label: 'Audio / EQ' },
  ]

  return (
    <div className={`mx-auto px-4 app-container min-h-screen transition-all duration-300 ${
      zone === 'androidtv' ? 'max-w-5xl' : 'max-w-2xl'
    }`}>
      <MemoStatusBar
        deviceName={deviceName}
        state={state}
        wsConnected={wsConnected}
        receiverIp={info?.receiver_ip}
        onOpenThemeModal={() => setThemeModalOpen(true)}
        activeZone={zone}
      />

      {/* Zone selector — hidden on mobile (bottom nav takes over) */}
      <div className="hidden sm:flex gap-0 mb-5 bg-denon-card/50 rounded-2xl p-1.5 border border-denon-border/50 backdrop-blur-sm">
        <motion.button
          onClick={() => setZone('main')}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            zone === 'main'
              ? 'bg-denon-gold text-denon-dark'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            {zoneName}
          </span>
        </motion.button>
        <motion.button
          onClick={() => setZone('zone2')}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            zone === 'zone2'
              ? 'bg-denon-gold text-denon-dark'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
            {z2Name}
          </span>
        </motion.button>
        <motion.button
          onClick={() => setZone('androidtv')}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 ${
            zone === 'androidtv'
              ? 'bg-denon-gold text-denon-dark'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
            Android TV
          </span>
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {zone === 'main' && (
          <motion.div
            key="main"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={FAST}
          >
            {!state.connected ? (
              <ReceiverSetup
                reason={setupReason}
                embedded={true}
                onConnect={() => {}}
                onOpenThemeModal={() => setThemeModalOpen(true)}
              />
            ) : (
              <>
                <div className="flex gap-1 mb-4">
                  {mainSections.map(s => (
                    <motion.button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      whileTap={{ scale: 0.96 }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeSection === s.id
                          ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
                          : 'text-denon-muted hover:text-denon-text'
                      }`}
                    >
                      {s.label}
                    </motion.button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                    variants={fadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={FAST}
                  >
                    {activeSection === 'controls' && (
                      <>
                        <div className="lg:col-span-2">
                          <MemoVolumeControl state={state} sendCommand={sendCommand} post={post} />
                        </div>
                        <MemoPowerControl state={state} sendCommand={sendCommand} zone="main" />
                        <MemoMediaControls state={state} sendCommand={sendCommand} post={post} />
                        <div className="lg:col-span-2">
                          <MemoSourceSelector
                            state={state}
                            sendCommand={sendCommand}
                            sources={configuredSources}
                            sourceNameMap={sourceNameMap}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <SurroundMode state={state} sendCommand={sendCommand} />
                        </div>
                      </>
                    )}

                    {activeSection === 'speakers' && (
                      <>
                        <div className="lg:col-span-2">
                          <MemoChannelLevels
                            channels={state.channel_volumes ?? {}}
                            channelNames={channelNames}
                            sendCommand={sendCommand}
                            post={post}
                            calibration={state.speaker_calibration}
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <SubwooferLevel state={state} post={post} />
                        </div>
                      </>
                    )}

                    {activeSection === 'audio' && (
                      <>
                        <ToneControls state={state} post={post} />
                        <MemoAudioSettings state={state} post={post} />
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}

        {zone === 'zone2' && (
          <motion.div
            key="zone2"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={FAST}
          >
            {!state.connected ? (
              <ReceiverSetup
                reason={setupReason}
                embedded={true}
                onConnect={() => {}}
                onOpenThemeModal={() => setThemeModalOpen(true)}
              />
            ) : (
              <Zone2Controls
                state={state}
                sendCommand={sendCommand}
                post={post}
                sources={configuredSources}
                sourceNameMap={sourceNameMap}
                zoneName={z2Name}
              />
            )}
          </motion.div>
        )}

        {zone === 'androidtv' && (
          <motion.div
            key="androidtv"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={FAST}
          >
            <MemoAndroidTvRemote
              state={state}
              activeAndroidPanel={activeAndroidPanel}
              setActiveAndroidPanel={setActiveAndroidPanel}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bottom navigation */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-denon-card/95 backdrop-blur-md border-t border-denon-border/50 flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <NavTab
          onClick={() => setZone('main')}
          active={zone === 'main'}
          label={zoneName}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          }
        />
        <NavTab
          onClick={() => setZone('zone2')}
          active={zone === 'zone2'}
          label={z2Name}
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
            </svg>
          }
        />
        <NavTab
          onClick={() => setZone('androidtv')}
          active={zone === 'androidtv'}
          label="Android TV"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
            </svg>
          }
        />
        <div className="w-px bg-denon-border/30 self-stretch my-2" />
        {zone !== 'androidtv' ? (
          <>
            <NavTab
              onClick={() => { setZone('main'); setActiveSection('controls') }}
              active={zone === 'main' && activeSection === 'controls'}
              dim={zone !== 'main'}
              label="Controls"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                  <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                  <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
                  <line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
              }
            />
            <NavTab
              onClick={() => { setZone('main'); setActiveSection('speakers') }}
              active={zone === 'main' && activeSection === 'speakers'}
              dim={zone !== 'main'}
              label="Speakers"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
              }
            />
            <NavTab
              onClick={() => { setZone('main'); setActiveSection('audio') }}
              active={zone === 'main' && activeSection === 'audio'}
              dim={zone !== 'main'}
              label="Audio"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              }
            />
          </>
        ) : (
          <>
            <NavTab
              onClick={() => setActiveAndroidPanel('remote')}
              active={activeAndroidPanel === 'remote'}
              label="Remote"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="5" y="2" width="14" height="20" rx="2" />
                  <circle cx="12" cy="18" r="1.5" />
                  <path d="M8 6h8M8 10h8M10 14h4" />
                </svg>
              }
            />
            <NavTab
              onClick={() => setActiveAndroidPanel('screen')}
              active={activeAndroidPanel === 'screen'}
              label="Screen"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M21 15l-5-5L5 21" />
                  <circle cx="9" cy="9" r="2" />
                </svg>
              }
            />
            <NavTab
              onClick={() => setActiveAndroidPanel('apps')}
              active={activeAndroidPanel === 'apps'}
              label="Apps"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              }
            />
            <NavTab
              onClick={() => setActiveAndroidPanel('adb')}
              active={activeAndroidPanel === 'adb'}
              label="ADB"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              }
            />
          </>
        )}
      </nav>

      <AnimatePresence>
        {themeModalOpen && (
          <ThemeModal
            key="theme-modal"
            currentConfig={state?.theme_config ?? { base: 'gold', overrides: {} }}
            onClose={() => setThemeModalOpen(false)}
            onSaved={cfg => patchState({ theme_config: cfg })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
