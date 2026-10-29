export type Section = 'controls' | 'speakers' | 'audio'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'audio', label: 'Audio / EQ' },
]

interface Props {
  section: Section
  onChange: (section: Section) => void
  /** Mobile bottom-nav variant (no bottom margin). */
  compact?: boolean
}

/** Main-zone section switch, rendered on desktop and in the mobile bottom nav. */
export default function SectionTabs({ section, onChange, compact = false }: Props) {
  return (
    <div role="group" aria-label="Section" className={compact ? 'flex gap-1' : 'flex gap-1 mb-4'}>
      {SECTIONS.map(s => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          aria-pressed={section === s.id}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
            section === s.id
              ? 'bg-denon-surface text-denon-gold border border-denon-gold/30'
              : 'text-denon-muted hover:text-denon-text'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
