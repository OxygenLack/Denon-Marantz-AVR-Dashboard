import type { ReceiverState, PostFn } from '../types'

interface Props {
  state: ReceiverState
  post: PostFn
}

export default function AudioSettings({ state, post }: Props) {
  const dynamicEq = state.dynamic_eq
  const dynamicVol = state.dynamic_volume
  const multeq = state.multeq
  const sleepTimer = state.sleep_timer
  const ecoMode = state.eco_mode

  const dynVolModes = ['OFF', 'LIT', 'MED', 'HEV'] as const
  const dynVolLabels: Record<string, string> = { OFF: 'Off', LIT: 'Light', MED: 'Medium', HEV: 'Heavy' }
  const multeqModes = ['AUDYSSEY', 'BYP.LR', 'FLAT', 'MANUAL', 'OFF'] as const
  const multeqLabels: Record<string, string> = { AUDYSSEY: 'Audyssey', 'BYP.LR': 'L/R Bypass', FLAT: 'Flat', MANUAL: 'Manual', OFF: 'Off' }
  const ecoModes = ['ON', 'AUTO', 'OFF'] as const

  return (
    <div className="card p-4 space-y-5">
      <h2 className="text-sm font-medium text-denon-muted">Audio Settings</h2>

      {/* MultEQ */}
      <div>
        <span className="text-xs text-denon-muted block mb-2">MultEQ</span>
        <div className="flex flex-wrap gap-1.5">
          {multeqModes.map(m => (
            <button
              key={m}
              onClick={() => post('/multeq', { mode: m })}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                multeq === m
                  ? 'bg-denon-gold text-denon-dark'
                  : 'bg-denon-surface text-denon-muted hover:bg-denon-border'
              }`}
            >
              {multeqLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic EQ */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-denon-muted">Dynamic EQ</span>
        <button
          onClick={() => post('/dynamic-eq', { enabled: !dynamicEq })}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            dynamicEq
              ? 'bg-denon-gold/20 text-denon-gold'
              : 'bg-denon-surface text-denon-muted'
          }`}
        >
          {dynamicEq ? 'On' : 'Off'}
        </button>
      </div>

      {/* Dynamic Volume */}
      <div>
        <span className="text-xs text-denon-muted block mb-2">Dynamic Volume</span>
        <div className="flex gap-1.5">
          {dynVolModes.map(m => (
            <button
              key={m}
              onClick={() => post('/dynamic-volume', { mode: m })}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 ${
                dynamicVol === m
                  ? 'bg-denon-gold text-denon-dark'
                  : 'bg-denon-surface text-denon-muted hover:bg-denon-border'
              }`}
            >
              {dynVolLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Eco Mode */}
      <div>
        <span className="text-xs text-denon-muted block mb-2">Eco Mode</span>
        <div className="flex gap-1.5">
          {ecoModes.map(m => (
            <button
              key={m}
              onClick={() => post('/eco', { mode: m })}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all flex-1 ${
                ecoMode === m
                  ? 'bg-denon-gold text-denon-dark'
                  : 'bg-denon-surface text-denon-muted hover:bg-denon-border'
              }`}
            >
              {m === 'ON' ? 'On' : m === 'AUTO' ? 'Auto' : 'Off'}
            </button>
          ))}
        </div>
      </div>

      {/* Sleep Timer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-denon-muted">Sleep Timer</span>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-denon-text">
            {sleepTimer ? `${sleepTimer} min` : 'Off'}
          </span>
          <select
            value={sleepTimer ?? ''}
            onChange={(e) => post('/sleep', { minutes: e.target.value ? parseInt(e.target.value) : 0 })}
            className="bg-denon-surface text-denon-text text-xs rounded-lg px-2 py-1.5 border border-denon-border"
          >
            <option value="">Off</option>
            <option value="10">10 min</option>
            <option value="20">20 min</option>
            <option value="30">30 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
            <option value="120">120 min</option>
          </select>
        </div>
      </div>
    </div>
  )
}
