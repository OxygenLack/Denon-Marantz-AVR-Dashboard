import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StatusBar from './StatusBar'
import type { ReceiverState } from '../types'

const state: ReceiverState = { connected: true, heos_connected: true }

function renderBar(wsConnected: boolean, wsConnecting: boolean, s: ReceiverState = state) {
  render(
    <StatusBar
      deviceName="AVR"
      state={s}
      info={{ receiver_ip: '192.168.1.5' }}
      post={vi.fn()}
      wsConnected={wsConnected}
      wsConnecting={wsConnecting}
      currentTheme="gold"
      onThemeChange={vi.fn()}
    />,
  )
}

describe('StatusBar', () => {
  it('reads "HTTP fallback" when telnet is up but the WebSocket is neither open nor connecting', () => {
    renderBar(false, false)
    expect(screen.getByText('HTTP fallback')).toBeInTheDocument()
  })

  it('reads Connected / Connecting / Disconnected otherwise', () => {
    renderBar(true, false)
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('reads Connecting while the WebSocket handshakes', () => {
    renderBar(false, true)
    expect(screen.getByText('Connecting')).toBeInTheDocument()
  })

  it('reads Disconnected when telnet is down', () => {
    renderBar(true, false, { connected: false })
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })
})
