import type { CSSProperties } from 'react'
import { parseSurroundMode, type ParsedSurroundMode } from './modeParser'

function signalExplanation(parsed: ParsedSurroundMode): string | null {
  if (!parsed?.raw) return null

  if (parsed.upmixer) {
    return `${parsed.codec} is the incoming audio codec from the source. ${parsed.upmixer} is the receiver's upmixer/post-processing mode that expands that signal to your available speakers.`
  }

  return `${parsed.codec} is the incoming audio codec or selected playback mode currently used by the receiver.`
}

interface Props {
  mode: string | null | undefined
}

export default function ModeSignal({ mode }: Props) {
  if (!mode) return null
  const parsed = parseSurroundMode(mode)
  const explanation = signalExplanation(parsed)

  return (
    <div className="mode-signal-wrap">
      <div className="mode-signal">
        <span className="mode-signal-label">Signal</span>
        <span
          className="mode-chip"
          style={{ '--chip-color': parsed.color } as CSSProperties}
          title={`${parsed.codec}: incoming codec / source format`}
        >
          {parsed.codec}
        </span>
        {parsed.upmixer && (
          <>
            <span className="mode-arrow">+</span>
            <span
              className="mode-chip mode-chip-upmix"
              title={`${parsed.upmixer}: receiver upmixer / sound mode`}
            >
              {parsed.upmixer}
            </span>
          </>
        )}
      </div>
      {explanation && (
        <p className="mode-signal-explanation">
          {explanation}
        </p>
      )}
    </div>
  )
}
