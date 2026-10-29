import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReceiverSetup from './ReceiverSetup'

describe('ReceiverSetup', () => {
  const props = { onConnect: vi.fn(), currentTheme: 'gold' as const, onThemeChange: vi.fn() }

  it('explains auto-discovery when no host is configured', () => {
    render(<ReceiverSetup reason="no_host" {...props} />)
    expect(screen.getByText(/Auto-discovery found no receivers/)).toBeInTheDocument()
  })

  it('reports a failed connect when a host is known', () => {
    render(<ReceiverSetup reason="connect_failed" {...props} />)
    expect(screen.getByText(/Could not connect to the configured receiver/)).toBeInTheDocument()
  })
})
