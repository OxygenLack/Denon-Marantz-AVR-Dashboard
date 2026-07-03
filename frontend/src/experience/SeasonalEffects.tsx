import { useMemo } from 'react'

type Season = 'christmas' | 'winter' | 'halloween'

interface Snowflake {
  id: number
  left: string
  delay: string
  duration: string
  size: string
  opacity: number
}

function getSeason(date: Date = new Date()): Season | null {
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (month === 12 && day <= 25) return 'christmas'
  if (month === 12 || month === 1 || month === 2) return 'winter'
  if (month === 10 && day >= 25) return 'halloween'
  return null
}

function Snow() {
  const flakes = useMemo<Snowflake[]>(() => Array.from({ length: 34 }, (_, i) => ({
    id: i,
    left: `${(i * 29) % 100}%`,
    delay: `${-((i * 0.73) % 12)}s`,
    duration: `${9 + (i % 7)}s`,
    size: `${2 + (i % 4)}px`,
    opacity: 0.25 + ((i % 5) * 0.12),
  })), [])

  return <div className="seasonal-snow" aria-hidden="true">
    {flakes.map(f => <span key={f.id} style={{
      left: f.left,
      animationDelay: f.delay,
      animationDuration: f.duration,
      width: f.size,
      height: f.size,
      opacity: f.opacity,
    }} />)}
  </div>
}

function ChristmasLights() {
  return <div className="seasonal-lights" aria-hidden="true">
    {Array.from({ length: 22 }, (_, i) => <span key={i} className={`light light-${i % 4}`} />)}
  </div>
}

function HalloweenBats() {
  return <div className="seasonal-bats" aria-hidden="true">
    <span>🦇</span><span>🦇</span><span>👻</span>
  </div>
}

interface Props {
  mode?: string
}

export default function SeasonalEffects({ mode = 'auto' }: Props) {
  if (mode === 'off') return null
  const forced = (['winter', 'christmas', 'halloween'] as const).includes(mode as Season) ? (mode as Season) : null
  const season = forced || getSeason()
  if (!season) return null
  if (season === 'christmas') return <><Snow /><ChristmasLights /></>
  if (season === 'winter') return <Snow />
  if (season === 'halloween') return <HalloweenBats />
  return null
}
