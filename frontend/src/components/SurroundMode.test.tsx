import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SurroundMode from './SurroundMode'
import type { SurroundCategory } from '../types'

const categories: SurroundCategory[] = [
  { code: 'MOV', label: 'Movie', command: 'MOVIE' },
  { code: 'PUR', label: 'Pure/Direct', command: 'DIRECT' },
]

describe('SurroundMode', () => {
  it('renders fallback modes from props and sends MS<mode>', () => {
    const send = vi.fn()
    render(
      <SurroundMode
        state={{ connected: true, surround_mode: 'STEREO' }}
        sendCommand={send}
        categories={categories}
        fallbackModes={['STEREO', 'JAZZ CLUB']}
      />,
    )
    expect(screen.getByRole('button', { name: 'STEREO' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'JAZZ CLUB' }))
    expect(send).toHaveBeenCalledWith('MSJAZZ CLUB')
  })

  it('renders the category tabs from props', () => {
    const send = vi.fn()
    render(
      <SurroundMode state={{ connected: true }} sendCommand={send} categories={categories} fallbackModes={[]} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Movie' }))
    expect(send).toHaveBeenCalledWith('MSMOVIE')
    expect(screen.getByRole('button', { name: 'Pure/Direct' })).toBeInTheDocument()
  })

  it('lists OPSMLALL modes when the receiver sends them', () => {
    const send = vi.fn()
    render(
      <SurroundMode
        state={{
          connected: true,
          surround_mode: 'STEREO',
          surround_mode_list: [
            { id: '01', category: 'MUS', command: 'STEREO', display_name: 'Stereo', active: true },
            { id: '02', category: 'MUS', command: 'JAZZ CLUB', display_name: 'Jazz Club' },
          ],
        }}
        sendCommand={send}
        categories={categories}
        fallbackModes={['VIRTUAL']}
      />,
    )
    expect(screen.queryByRole('button', { name: 'VIRTUAL' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Jazz Club' }))
    expect(send).toHaveBeenCalledWith('MSJAZZ CLUB')
  })
})
