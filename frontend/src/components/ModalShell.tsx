import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

const CLOSE_ANIMATION_MS = 150

type Slot = ReactNode | ((close: () => void) => ReactNode)

interface Props {
  open: boolean
  /** Called once the closing animation has finished. */
  onClose: () => void
  /** Value of `data-modal`; the keyboard shortcuts stay off while one is open. */
  modalId: string
  title: ReactNode
  subtitle?: ReactNode
  /** Before the title (e.g. a back button). */
  headerLeft?: ReactNode
  /** Right after the title (e.g. a count badge). */
  titleAside?: ReactNode
  /** Before the close button. */
  headerRight?: ReactNode
  footer?: Slot
  closeLabel?: string
  /** Body. A function receives `close()`, which runs the closing animation. */
  children: Slot
}

const render = (slot: Slot | undefined, close: () => void): ReactNode =>
  typeof slot === 'function' ? slot(close) : slot

/** Portal, backdrop, panel, header with close button, Escape, closing animation. */
export default function ModalShell({
  open, onClose, modalId, title, subtitle, headerLeft, titleAside, headerRight, footer, closeLabel, children,
}: Props) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const close = useCallback(() => {
    if (timer.current) return // already closing
    setClosing(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setClosing(false)
      onCloseRef.current()
    }, CLOSE_ANIMATION_MS)
  }, [])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  if (!open) return null

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/70 z-50 transition-opacity duration-150 ${closing ? 'opacity-0' : 'opacity-100'}`}
        onClick={close}
      />
      <div
        data-modal={modalId}
        role="dialog"
        aria-modal="true"
        className={`fixed inset-2 sm:inset-auto sm:top-4 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl
          bg-denon-dark rounded-2xl z-50 flex flex-col overflow-hidden
          border border-denon-gold/40 shadow-2xl shadow-black/50
          transition-all duration-150 ease-out ${closing ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0 fade-in'}`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-denon-border/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {headerLeft}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-denon-text truncate">{title}</h2>
              {subtitle && <p className="text-[10px] text-denon-muted">{subtitle}</p>}
            </div>
            {titleAside}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {headerRight}
            <button
              onClick={close}
              className="text-denon-muted hover:text-denon-text transition-colors p-1"
              aria-label={closeLabel ?? 'Close'}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        {render(children, close)}
        {footer && (
          <div className="px-4 py-3 border-t border-denon-border/30 flex items-center justify-between gap-2 shrink-0">
            {render(footer, close)}
          </div>
        )}
      </div>
    </>,
    document.body,
  )
}
