import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, TOAST_TTL_MS } from './Toaster'
import { useToast } from '../hooks/useToast'

function Trigger({ text }: { text: string }) {
  const { show } = useToast()
  return <button onClick={() => show({ kind: 'error', text })}>fire</button>
}

describe('ToastProvider', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows a toast and auto-dismisses it after the TTL', () => {
    render(<ToastProvider><Trigger text="Play failed (502)" /></ToastProvider>)
    fireEvent.click(screen.getByText('fire'))
    expect(screen.getByText('Play failed (502)')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')

    act(() => { vi.advanceTimersByTime(TOAST_TTL_MS - 1) })
    expect(screen.getByText('Play failed (502)')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByText('Play failed (502)')).not.toBeInTheDocument()
  })

  it('dismisses on click', () => {
    render(<ToastProvider><Trigger text="Volume failed (500)" /></ToastProvider>)
    fireEvent.click(screen.getByText('fire'))
    fireEvent.click(screen.getByText('Volume failed (500)'))
    expect(screen.queryByText('Volume failed (500)')).not.toBeInTheDocument()
  })

  it('keeps at most three toasts, dropping the oldest', () => {
    function Many() {
      const { show } = useToast()
      return <button onClick={() => [1, 2, 3, 4].forEach(n => show({ kind: 'info', text: `toast ${n}` }))}>fire</button>
    }
    render(<ToastProvider><Many /></ToastProvider>)
    fireEvent.click(screen.getByText('fire'))
    expect(screen.queryByText('toast 1')).not.toBeInTheDocument()
    expect(screen.getByText('toast 2')).toBeInTheDocument()
    expect(screen.getByText('toast 4')).toBeInTheDocument()
    expect(screen.getAllByRole('button').filter(b => b.textContent?.includes('toast'))).toHaveLength(3)
  })
})
