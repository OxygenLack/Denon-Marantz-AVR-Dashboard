import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { VOLUME } from '../protocol'
import type { PostFn, ReceiverState, SendCommandFn, Zone } from '../types'

function volumeToHalfStepCommand(volume: number | undefined, delta: number): string {
  const base = Number.isFinite(Number(volume)) ? Number(volume) : 40
  const next = Math.max(VOLUME.min, Math.min(VOLUME.max, Math.round((base + delta) * 2) / 2))
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

/** Whether a key event belongs to the browser, a form control or an open modal. */
function shouldIgnore(e: KeyboardEvent): boolean {
  // Cmd+P must print, Ctrl+M must not mute; a held key must not toggle twice.
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true
  // Any open modal (data-modal is set by ModalShell) owns the keyboard.
  if (document.querySelector('[data-modal]')) return true
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return true
  // Space on a focused button activates that button, not play/pause.
  if (e.key === ' ' && tag === 'BUTTON') return true
  return false
}

export function useKeyboardShortcuts(args: UseKeyboardShortcutsArgs): void {
  // Latest props for the listener, so it is registered once instead of on
  // every state push.
  const latestRef = useRef(args)
  latestRef.current = args

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (shouldIgnore(e)) return
      const { state, post, sendCommand, zone, setZone } = latestRef.current

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
  }, [])
}
