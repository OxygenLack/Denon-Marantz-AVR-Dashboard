import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModalShell from './ModalShell'

describe('ModalShell', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const renderShell = (onClose = vi.fn()) => {
    render(
      <ModalShell open onClose={onClose} modalId="test" title="Title" closeLabel="Close test" footer={<span>Footer</span>}>
        {close => <button onClick={close}>Inner close</button>}
      </ModalShell>,
    )
    return onClose
  }

  it('marks the dialog with data-modal', () => {
    renderShell()
    expect(document.querySelector('[data-modal="test"]')).not.toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('calls onClose after the closing animation on Escape', () => {
    const onClose = renderShell()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(150) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes from the header button and from the render prop, once', () => {
    const onClose = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Close test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inner close' }))
    act(() => { vi.advanceTimersByTime(500) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when closed', () => {
    render(<ModalShell open={false} onClose={vi.fn()} modalId="test" title="T">body</ModalShell>)
    expect(document.querySelector('[data-modal]')).toBeNull()
  })
})
