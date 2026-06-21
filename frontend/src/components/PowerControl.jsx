export default function PowerControl({ state, sendCommand, zone = 'main' }) {
  const power = zone === 'main' ? state?.power : state?.z2_power

  // Use ZMON/ZMOFF for main zone only (PWON turns on both zones)
  const onCmd = zone === 'main' ? 'ZMON' : 'Z2ON'
  const offCmd = zone === 'main' ? 'ZMOFF' : 'Z2OFF'

  return (
    <div className="card flex items-center justify-between">
      <div>
        <h2 className="text-xs font-medium text-denon-muted uppercase tracking-wider mb-1">Power</h2>
        <p className="text-lg font-bold">
          {power ? 'On' : power === false ? 'Standby' : '—'}
        </p>
      </div>
      <button
        onClick={() => sendCommand(power ? offCmd : onCmd)}
        aria-label={power ? `Turn ${zone === 'main' ? 'main zone' : 'Zone 2'} off` : `Turn ${zone === 'main' ? 'main zone' : 'Zone 2'} on`}
        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          power
            ? 'bg-gradient-to-br from-denon-gold to-amber-600 text-denon-dark shadow-lg shadow-denon-gold/30'
            : 'bg-denon-surface text-denon-muted hover:bg-denon-border hover:text-denon-text'
        }`}
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 2v8" />
          <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
        </svg>
      </button>
    </div>
  )
}
