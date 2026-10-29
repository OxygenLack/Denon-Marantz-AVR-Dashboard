import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type Toast, type ToastInput } from '../hooks/useToast'

export const TOAST_TTL_MS = 4000
export const TOAST_MAX = 3

interface Props {
  children: ReactNode
}

/**
 * Toast provider: `useToast().show({ kind, text })` from anywhere below it.
 * Max 3 visible (oldest drops first), auto-dismiss after 4 s, click to dismiss.
 * Bottom-right on desktop; above the mobile bottom nav on phones.
 */
export function ToastProvider({ children }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  const show = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setToasts(prev => {
      const next = [...prev, { ...input, id }]
      // Drop the oldest beyond the cap; their timers are cleared by dismiss().
      while (next.length > TOAST_MAX) {
        const old = next.shift()
        if (old) {
          const t = timers.current.get(old.id)
          if (t) clearTimeout(t)
          timers.current.delete(old.id)
        }
      }
      return next
    })
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_TTL_MS))
  }, [dismiss])

  useEffect(() => {
    const pending = timers.current
    return () => { pending.forEach(clearTimeout); pending.clear() }
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed right-4 z-[60] flex flex-col items-end gap-2 pointer-events-none
          bottom-[calc(env(safe-area-inset-bottom)+7rem)] sm:bottom-4"
      >
        {toasts.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto max-w-[min(90vw,22rem)] text-left text-sm rounded-xl px-3.5 py-2.5 shadow-lg shadow-black/30
              border backdrop-blur-sm fade-in ${
              t.kind === 'error'
                ? 'bg-denon-card/95 border-denon-red/40 text-denon-text'
                : 'bg-denon-card/95 border-denon-border text-denon-text'
            }`}
          >
            <span className={`mr-2 ${t.kind === 'error' ? 'text-denon-red' : 'text-denon-gold'}`}>
              {t.kind === 'error' ? '✕' : 'ℹ'}
            </span>
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
