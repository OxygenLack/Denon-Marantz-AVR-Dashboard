import { useCallback } from 'react'
import PowerControl from './PowerControl'
import MediaControls from './MediaControls'
import SourceSelector from './SourceSelector'
import SleepTimerSelect from './SleepTimerSelect'
import VolumeButtons from './VolumeButtons'
import { useDebouncedLevel } from '../hooks/useDebouncedLevel'
import { VOLUME } from '../protocol'
import type { ReceiverState, SendCommandFn, PostFn, SourceEntry, RadioFavorite } from '../types'

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  post: PostFn
  mediaSources: string[]
  sources: SourceEntry[]
  sourceNameMap?: Record<string, string>
  sourceNameOverrides?: Record<string, string>
  radioFavorites?: RadioFavorite[]
  onRenameSource?: (code: string, name: string | null) => void
  onRadioFavoriteChange?: (favorite: RadioFavorite, enabled: boolean) => void
}

export default function Zone2Controls({ state, sendCommand, post, mediaSources, sources, sourceNameMap, sourceNameOverrides, radioFavorites, onRenameSource, onRadioFavoriteChange }: Props) {
  const muted = state.z2_muted
  const sleepTimer = state.z2_sleep_timer

  const sendVolume = useCallback((level: number) => post('/zone2/volume', { level }), [post])
  const { value: volume, onChange: onVolumeChange } = useDebouncedLevel(state.z2_volume, sendVolume)

  const setSleep = useCallback((minutes: number | null) => {
    sendCommand(minutes == null ? 'Z2SLPOFF' : `Z2SLP${String(minutes).padStart(3, '0')}`)
  }, [sendCommand])

  return (
    <div className="space-y-4">
      <PowerControl state={state} sendCommand={sendCommand} zone="zone2" />

      {/* Volume */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-1">Volume</h2>
            <p className="text-2xl font-bold tabular-nums">{volume ?? '—'}</p>
          </div>
          <VolumeButtons
            muted={muted}
            onDown={() => sendCommand('Z2DOWN')}
            onUp={() => sendCommand('Z2UP')}
            onToggleMute={() => sendCommand(muted ? 'Z2MUOFF' : 'Z2MUON')}
            label="Zone 2 volume"
            muteTarget="Zone 2"
          />
        </div>
        <input
          type="range"
          aria-label="Zone 2 volume"
          min={VOLUME.min} max={VOLUME.max} step={1}
          value={volume ?? VOLUME.min}
          onChange={e => onVolumeChange(parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      {/* Sleep Timer */}
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-1">Sleep Timer</h2>
            <p className="text-sm text-denon-text">{sleepTimer == null ? 'Off' : `${sleepTimer} min`}</p>
          </div>
          <SleepTimerSelect
            value={sleepTimer}
            onChange={setSleep}
            label="Zone 2 sleep timer"
            className="rounded-xl text-sm px-3 py-2"
          />
        </div>
      </div>

      {/* Media */}
      <MediaControls state={state} post={post} mediaSources={mediaSources} zone="zone2" />

      {/* Source */}
      <SourceSelector
        state={state}
        sendCommand={sendCommand}
        sources={sources}
        sourceNameMap={sourceNameMap}
        sourceNameOverrides={sourceNameOverrides}
        radioFavorites={radioFavorites}
        onRenameSource={onRenameSource}
        onRadioFavoriteChange={onRadioFavoriteChange}
        zone="zone2"
      />
    </div>
  )
}
