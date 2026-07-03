import { useState } from 'react'
import NightModeModal from './NightModeModal'
import type { ReceiverState, DeviceInfo, PostFn } from '../types'
import type { NightModeConfigState } from './NightModeModal'

interface Props {
  state: ReceiverState | null | undefined
  info: DeviceInfo | null | undefined
  post: PostFn
  onConfigChange?: (config: NightModeConfigState) => void | Promise<void>
}

export default function NightModeButton({ state, info, post, onConfigChange }: Props) {
  const [open, setOpen] = useState(false)
  const active = Boolean(state?.night_mode_enabled)
  const configured = (info?.night_mode_config?.channels || []).length > 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
          active
            ? 'bg-denon-gold/20 text-denon-gold ring-1 ring-denon-gold/40'
            : 'text-denon-muted hover:text-denon-text hover:bg-denon-surface/70'
        }`}
        title="Night Mode"
        aria-label="Night Mode settings"
      >
        <span className="text-base">🌙</span>
        {configured && !active && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-denon-muted" />
        )}
        {active && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-denon-gold animate-pulse" />
        )}
      </button>
      <NightModeModal
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        info={info}
        post={post}
        onConfigChange={onConfigChange}
      />
    </>
  )
}
