import type { ReceiverState, SendCommandFn, Zone } from '../types'

interface Props {
  state: ReceiverState
  sendCommand: SendCommandFn
  zone?: Zone
}

export default function PowerControl({ state, sendCommand, zone = 'main' }: Props) {
  const power = zone === 'main' ? state.power : state.z2_power

  // ZMON/ZMOFF for main zone only — PWON turns on both zones
  const onCmd = zone === 'main' ? 'ZMON' : 'Z2ON'
  const offCmd = zone === 'main' ? 'ZMOFF' : 'Z2OFF'

  return (
    <div className="card flex items-center justify-between">
      <p className="text-sm font-medium text-denon-muted">
        {power ? 'On' : power === false ? 'Standby' : '—'}
      </p>
      <button
        onClick={() => sendCommand(power ? offCmd : onCmd)}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
          power
            ? 'bg-denon-gold text-denon-dark shadow-md shadow-denon-gold/20'
            : 'bg-denon-surface text-denon-muted hover:bg-denon-border hover:text-denon-text'
        }`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2v8" />
          <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
        </svg>
      </button>
    </div>
  )
}
