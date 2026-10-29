interface Props {
  muted: boolean | undefined
  onDown: () => void
  onUp: () => void
  onToggleMute: () => void
  /** Prefix for the step buttons' accessible names, e.g. "Volume" or "Zone 2 volume". */
  label?: string
  /** Appended to the mute button's name, e.g. "Zone 2" → "Mute Zone 2". */
  muteTarget?: string
}

const MUTED_ICON = 'M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.6.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .38.25.71.61.85C17.18 6.54 19 9.06 19 12zm-8.71-6.29l-.17.17L12 7.76V6.41c0-.89-1.08-1.33-1.71-.7zM16.5 12A4.5 4.5 0 0014 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z'
const SPEAKER_ICON = 'M3 10v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71V6.41c0-.89-1.08-1.34-1.71-.71L7 9H4c-.55 0-1 .45-1 1zm13.5 2A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-3.98zM14 3.23v.06c0 .38.25.71.61.85C17.18 5.18 19 7.71 19 10.69c0 2.99-1.82 5.52-4.39 6.56-.36.14-.61.47-.61.85v.06c0 .63.63 1.09 1.22.86C18.6 17.84 21 14.53 21 10.69c0-3.83-2.4-7.14-5.78-8.32-.59-.23-1.22.24-1.22.86z'

/** The −/mute/+ cluster shared by the main zone and Zone 2. */
export default function VolumeButtons({ muted, onDown, onUp, onToggleMute, label = 'Volume', muteTarget }: Props) {
  const muteLabel = `${muted ? 'Unmute' : 'Mute'}${muteTarget ? ` ${muteTarget}` : ''}`
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onDown}
        aria-label={`${label} down`}
        className="btn-ghost w-10 h-10 flex items-center justify-center text-lg font-bold rounded-xl"
      >−</button>
      <button
        onClick={onToggleMute}
        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
          muted
            ? 'bg-denon-red/20 text-denon-red ring-1 ring-denon-red/30'
            : 'bg-denon-surface/70 text-denon-muted hover:bg-denon-border'
        }`}
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muteLabel}
        aria-pressed={Boolean(muted)}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d={muted ? MUTED_ICON : SPEAKER_ICON} />
        </svg>
      </button>
      <button
        onClick={onUp}
        aria-label={`${label} up`}
        className="btn-ghost w-10 h-10 flex items-center justify-center text-lg font-bold rounded-xl"
      >+</button>
    </div>
  )
}
