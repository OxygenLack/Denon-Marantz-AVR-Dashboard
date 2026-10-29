import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SourceSelector from './SourceSelector'
import type { ReceiverState, SourceEntry } from '../types'

const state: ReceiverState = { connected: true, source: 'GAME' }
const sources: SourceEntry[] = [
  { id: 'GAME', name: 'PS5', default_name: 'Game' },
  { id: 'IRADIO', name: 'Internet Radio', default_name: 'Internet Radio' },
]
const nameMap = { GAME: 'PS5', IRADIO: 'Internet Radio' }

function renderSelector(onRenameSource = vi.fn()) {
  render(
    <SourceSelector
      state={state}
      sendCommand={vi.fn()}
      sources={sources}
      sourceNameMap={nameMap}
      sourceNameOverrides={{ GAME: 'PS5' }}
      onRenameSource={onRenameSource}
    />,
  )
  return onRenameSource
}

describe('SourceSelector', () => {
  it('renders the radio badge as its own button', () => {
    renderSelector()
    const badge = screen.getByRole('button', { name: 'Browse radio stations' })
    expect(badge.closest('button')).toBe(badge) // not nested in the tile button
    expect(badge.parentElement?.closest('button')).toBeNull()
  })

  it('shows Reset as a separate button in rename mode, with the default name', () => {
    const onRename = renderSelector()
    fireEvent.click(screen.getByRole('button', { name: 'Rename inputs' }))
    const reset = screen.getByRole('button', { name: 'Reset PS5 to Game' })
    expect(reset.parentElement?.closest('button')).toBeNull()
    fireEvent.click(reset)
    expect(onRename).toHaveBeenCalledWith('GAME', null)
  })

  it('ignores right-click outside rename mode', () => {
    const onRename = renderSelector()
    fireEvent.contextMenu(screen.getByRole('button', { name: /PS5/ }))
    expect(onRename).not.toHaveBeenCalled()
  })

  it('resets on right-click in rename mode', () => {
    const onRename = renderSelector()
    fireEvent.click(screen.getByRole('button', { name: 'Rename inputs' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: /PS5✎/ }))
    expect(onRename).toHaveBeenCalledWith('GAME', null)
  })

  it('renders no tiles before /device delivered the sources', () => {
    render(<SourceSelector state={state} sendCommand={vi.fn()} sources={[]} />)
    expect(screen.queryByRole('button', { name: /PS5/ })).toBeNull()
  })
})
