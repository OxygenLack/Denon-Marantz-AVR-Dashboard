import { useState, useRef, useCallback, useEffect } from 'react'
import PowerControl from './PowerControl'
import MediaControls from './MediaControls'
import SourceSelector from './SourceSelector'

export default function Zone2Controls({ state, sendCommand, post, sources, sourceNameMap, sourceNameOverrides, radioFavorites, onRenameSource, onRadioFavoriteChange, zoneName }) {
  const volume = state?.z2_volume
  const muted = state?.z2_muted
  const sleepTimer = state?.z2_sleep_timer

  const [localVol, setLocalVol] = useState(volume ?? 0)
  const [selectedSleep, setSelectedSleep] = useState(sleepTimer ?? 'OFF')
  const debounceRef = useRef(null)

  useEffect(() => {
    if (volume != null) setLocalVol(volume)
  }, [volume])

  useEffect(() => {
    setSelectedSleep(sleepTimer ?? 'OFF')
  }, [sleepTimer])

  const handleVolChange = useCallback((e) => {
    const v = parseInt(e.target.value)
    setLocalVol(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => post('/zone2/volume', { level: v }), 150)
  }, [post])

  const setSleep = useCallback(() => {
    if (selectedSleep === 'OFF') sendCommand('Z2SLPOFF')
    else sendCommand(`Z2SLP${String(selectedSleep).padStart(3, '0')}`)
  }, [selectedSleep, sendCommand])

  return (
    <div className="space-y-4">
      <PowerControl state={state} sendCommand={sendCommand} zone="zone2" />

      {/* Volume */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-1">Volume</h2>
            <p className="text-2xl font-bold tabular-nums">{localVol ?? '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => sendCommand('Z2DOWN')} className="btn-ghost w-10 h-10 flex items-center justify-center text-lg font-bold">−</button>
            <button
              onClick={() => sendCommand(muted ? 'Z2MUOFF' : 'Z2MUON')}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                muted
                  ? 'bg-denon-red/20 text-denon-red ring-1 ring-denon-red/30'
                  : 'bg-denon-surface/70 text-denon-muted hover:bg-denon-border'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                {muted ? (
                  <path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.33-1.71-.7zM16.5 12A4.5 4.5 0 0014 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z"/>
                ) : (
                  <path d="M3 10v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71V6.41c0-.89-1.08-1.34-1.71-.71L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-3.98zM14 3.23v.06c0 .38.25.71.61.85C17.18 5.18 19 7.71 19 10.69c0 2.99-1.82 5.52-4.39 6.56-.36.14-.61.47-.61.85v.06c0 .63.63 1.09 1.22.86C18.6 17.84 21 14.53 21 10.69c0-3.83-2.4-7.14-5.78-8.32-.59-.23-1.22.24-1.22.86z"/>
                )}
              </svg>
            </button>
            <button onClick={() => sendCommand('Z2UP')} className="btn-ghost w-10 h-10 flex items-center justify-center text-lg font-bold">+</button>
          </div>
        </div>
        <input
          type="range" min={0} max={98} step={1}
          value={localVol ?? 0}
          onChange={handleVolChange}
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
          <div className="flex items-center gap-2">
            <select
              value={selectedSleep}
              onChange={(e) => setSelectedSleep(e.target.value === 'OFF' ? 'OFF' : parseInt(e.target.value, 10))}
              className="bg-denon-surface border border-denon-border/50 rounded-xl text-sm px-3 py-2 text-denon-text"
            >
              <option value="OFF">OFF</option>
              {[10, 20, 30, 60, 90, 120].map(min => (
                <option key={min} value={min}>{min} min</option>
              ))}
            </select>
            <button onClick={setSleep} className="btn-ghost px-4 py-2 text-sm font-medium">Set</button>
          </div>
        </div>
      </div>

      {/* Media */}
      <MediaControls state={state} sendCommand={sendCommand} post={post} zone="zone2" />

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
