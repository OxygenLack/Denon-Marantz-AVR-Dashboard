import type { Zone } from '../types'

interface Props {
  zone: Zone
  onChange: (zone: Zone) => void
  mainName: string
  zone2Name: string
  /** Mobile bottom-nav variant: smaller, no icons, no card frame. */
  compact?: boolean
}

const MainIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
)
const Zone2Icon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
)

/** Main zone / Zone 2 switch, rendered on desktop and in the mobile bottom nav. */
export default function ZoneTabs({ zone, onChange, mainName, zone2Name, compact = false }: Props) {
  const tabs: { id: Zone; name: string; icon: React.ReactNode }[] = [
    { id: 'main', name: mainName, icon: <MainIcon /> },
    { id: 'zone2', name: zone2Name, icon: <Zone2Icon /> },
  ]
  return (
    <div
      role="group"
      aria-label="Zone"
      className={compact
        ? 'flex gap-1'
        : 'flex gap-0 mb-5 bg-denon-card/50 rounded-2xl p-1.5 border border-denon-border/50 backdrop-blur-sm'}
    >
      {tabs.map(tab => {
        const active = zone === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={`flex-1 font-semibold transition-all ${
              compact ? 'py-2 rounded-lg text-xs' : 'py-3 px-4 rounded-xl text-sm duration-200'
            } ${
              active
                ? `bg-gradient-to-r from-denon-gold to-amber-500 text-denon-dark ${compact ? '' : 'shadow-lg shadow-denon-gold/25'}`
                : 'text-denon-muted hover:text-denon-text'
            }`}
          >
            {compact ? tab.name : (
              <span className="flex items-center justify-center gap-2">
                {tab.icon}
                {tab.name}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
