import { ambientFromState } from './modeParser'

export default function AmbientBackground({ state, intensity = 1 }) {
  const ambient = ambientFromState(state)
  const safeIntensity = Math.max(0, Math.min(2, Number(intensity) || 1))
  return (
    <div
      className={`ambient-bg ambient-${ambient.mood}`}
      style={{
        '--ambient-color': ambient.color,
        '--ambient-intensity': ambient.intensity * safeIntensity,
      }}
      aria-hidden="true"
    >
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-grid" />
    </div>
  )
}
