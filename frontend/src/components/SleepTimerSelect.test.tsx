import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SleepTimerSelect from './SleepTimerSelect'

describe('SleepTimerSelect', () => {
  it('shows a non-preset value (set on the remote) as the selected option', () => {
    render(<SleepTimerSelect value={45} onChange={vi.fn()} label="Sleep" />)
    const select = screen.getByLabelText('Sleep') as HTMLSelectElement
    expect(select.value).toBe('45')
    expect(screen.getByRole('option', { name: '45 min' })).toBeInTheDocument()
  })

  it('reads Off when no timer runs', () => {
    render(<SleepTimerSelect value={null} onChange={vi.fn()} label="Sleep" />)
    expect((screen.getByLabelText('Sleep') as HTMLSelectElement).value).toBe('OFF')
  })

  it('applies on change, null for Off', () => {
    const onChange = vi.fn()
    render(<SleepTimerSelect value={30} onChange={onChange} label="Sleep" />)
    fireEvent.change(screen.getByLabelText('Sleep'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Sleep'), { target: { value: 'OFF' } })
    expect(onChange).toHaveBeenNthCalledWith(1, 60)
    expect(onChange).toHaveBeenNthCalledWith(2, null)
  })
})
