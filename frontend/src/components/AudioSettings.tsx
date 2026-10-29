import SegmentedControl, { type SegmentOption } from './SegmentedControl'
import SleepTimerSelect from './SleepTimerSelect'
import type { ReceiverState, PostFn } from '../types'

const DYN_VOL_MODES: SegmentOption<string>[] = [
  { value: 'OFF', label: 'Off' }, { value: 'LIT', label: 'Light' },
  { value: 'MED', label: 'Medium' }, { value: 'HEV', label: 'Heavy' },
]
const MULTEQ_MODES: SegmentOption<string>[] = [
  { value: 'AUDYSSEY', label: 'Audyssey' }, { value: 'BYP.LR', label: 'L/R Bypass' },
  { value: 'FLAT', label: 'Flat' }, { value: 'MANUAL', label: 'Manual' }, { value: 'OFF', label: 'Off' },
]
const ECO_MODES: SegmentOption<string>[] = [
  { value: 'ON', label: 'On' }, { value: 'AUTO', label: 'Auto' }, { value: 'OFF', label: 'Off' },
]

interface Props {
  state: ReceiverState
  post: PostFn
}

export default function AudioSettings({ state, post }: Props) {
  const dynamicEq = state?.dynamic_eq
  const dynamicVol = state?.dynamic_volume
  const multeq = state?.multeq
  const sleepTimer = state?.sleep_timer
  const ecoMode = state?.eco_mode

  return (
    <div className="card space-y-5">
      <h2 className="text-sm font-medium text-denon-muted">Audio Settings</h2>

      {/* MultEQ */}
      <div>
        <span className="text-xs text-denon-muted block mb-2">MultEQ</span>
        <SegmentedControl label="MultEQ" options={MULTEQ_MODES} value={multeq} onChange={mode => post('/multeq', { mode })} />
      </div>

      {/* Dynamic EQ */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-denon-muted">Dynamic EQ</span>
        <button
          onClick={() => post('/dynamic-eq', { enabled: !dynamicEq })}
          aria-pressed={Boolean(dynamicEq)}
          aria-label="Dynamic EQ"
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
        <SegmentedControl label="Dynamic Volume" grow options={DYN_VOL_MODES} value={dynamicVol} onChange={mode => post('/dynamic-volume', { mode })} />
      </div>

      {/* Eco Mode */}
      <div>
        <span className="text-xs text-denon-muted block mb-2">Eco Mode</span>
        <SegmentedControl label="Eco Mode" grow options={ECO_MODES} value={ecoMode} onChange={mode => post('/eco', { mode })} />
      </div>

      {/* Sleep Timer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-denon-muted">Sleep Timer</span>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-denon-text">
            {sleepTimer ? `${sleepTimer} min` : 'Off'}
          </span>
          <SleepTimerSelect
            value={sleepTimer}
            onChange={minutes => post('/sleep', { minutes: minutes ?? 0 })}
            label="Sleep timer"
            className="text-xs rounded-lg px-2 py-1.5"
          />
        </div>
      </div>
    </div>
  )
}
