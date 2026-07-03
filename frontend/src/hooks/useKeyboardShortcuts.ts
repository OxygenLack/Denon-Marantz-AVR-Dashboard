import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PostFn, ReceiverState, SendCommandFn, Zone } from '../types'

function volumeToHalfStepCommand(volume: number | undefined, delta: number): string {
  const base = Number.isFinite(Number(volume)) ? Number(volume) : 40
  const next = Math.max(0, Math.min(98, Math.round((base + delta) * 2) / 2))
  const whole = Math.floor(next)
  return Number.isInteger(next) ? `MV${String(whole).padStart(2, '0')}` : `MV${String(whole).padStart(2, '0')}5`
}

interface UseKeyboardShortcutsArgs {
  state: ReceiverState | null
  post: PostFn
  sendCommand: SendCommandFn
  zone: Zone
  setZone: Dispatch<SetStateAction<Zone>>
}

export function useKeyboardShortcuts({ state, post, sendCommand, zone, setZone }: UseKeyboardShortcutsArgs): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (document.querySelector('[data-modal="radio"]')) return

      const emitHint = (label: string): void => {
        window.dispatchEvent(new CustomEvent('denon-shortcut', { detail: { key: e.key, label } }))
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          emitHint('Play / Pause')
          if (state?.play_state === 'play') post('/media/pause')
          else post('/media/play')
          break
        case 'ArrowUp':
          e.preventDefault()
          emitHint(e.shiftKey && zone === 'main' ? 'Volume +0.5' : 'Volume Up')
          if (zone === 'zone2') sendCommand('Z2UP')
          else if (e.shiftKey) sendCommand(volumeToHalfStepCommand(state?.volume, 0.5))
          else sendCommand('MVUP')
          break
        case 'ArrowDown':
          e.preventDefault()
          emitHint(e.shiftKey && zone === 'main' ? 'Volume -0.5' : 'Volume Down')
          if (zone === 'zone2') sendCommand('Z2DOWN')
          else if (e.shiftKey) sendCommand(volumeToHalfStepCommand(state?.volume, -0.5))
          else sendCommand('MVDOWN')
          break
        case 'm':
        case 'M':
          e.preventDefault()
          emitHint('Mute Toggle')
          if (zone === 'zone2') sendCommand(state?.z2_muted ? 'Z2MUOFF' : 'Z2MUON')
          else sendCommand(state?.muted ? 'MUOFF' : 'MUON')
          break
        case 'p':
        case 'P':
          e.preventDefault()
          emitHint('Power Toggle')
          if (zone === 'zone2') sendCommand(state?.z2_power ? 'Z2OFF' : 'Z2ON')
          else sendCommand(state?.power ? 'ZMOFF' : 'PWON')
          break
        case 'z':
        case 'Z':
          e.preventDefault()
          emitHint('Zone Toggle')
          setZone(prev => prev === 'main' ? 'zone2' : 'main')
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state, post, sendCommand, zone, setZone])
}
