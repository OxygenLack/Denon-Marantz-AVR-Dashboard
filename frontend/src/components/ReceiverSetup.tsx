import { useState } from 'react'
import ThemePicker from './ThemePicker'
import type { ThemeName } from '../types'

interface DiscoveredDevice {
  ip: string
  model: string
  telnet_port: number
  heos_available?: boolean
}

interface Props {
  reason?: string
  onConnect: (ip: string) => void
  currentTheme: ThemeName
  onThemeChange: (name: ThemeName) => void
}

const README_URL = 'https://github.com/OxygenLack/Denon-Marantz-AVR-Dashboard#quick-start-docker'

export default function ReceiverSetup({ reason, onConnect, currentTheme, onThemeChange }: Props) {
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<DiscoveredDevice[] | null>(null)
  const [manualIp, setManualIp] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scan = async () => {
    setScanning(true)
    setDevices(null)
    setError(null)
    try {
      const res = await fetch('/api/v1/discover')
      const data = await res.json() as { devices?: DiscoveredDevice[] }
      setDevices(data.devices || [])
      if ((data.devices || []).length === 0) {
        setError('No receivers found. SSDP auto-discovery requires network_mode: host in your compose.yaml. See the setup guide below.')
      }
    } catch {
      setError('Scan failed — the backend may not be reachable.')
    } finally {
      setScanning(false)
    }
  }

  const connect = async (ip: string) => {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: ip }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onConnect(ip)
    } catch {
      setError(`Could not connect to ${ip}. Make sure the receiver is on and reachable.`)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-denon-dark p-6 relative">
      <div className="absolute top-4 right-4">
        <ThemePicker currentTheme={currentTheme} onThemeChange={onThemeChange} />
      </div>
      <div className="w-full max-w-md space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-denon-card border border-denon-border flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-denon-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-denon-text">Denon Dashboard</h1>
          <p className="text-denon-muted text-sm mt-1">No receiver connected</p>
        </div>

        {/* Status banner */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="text-sm">
            {reason === 'no_host' ? (
              <span className="text-amber-200">
                Auto-discovery found no receivers. Make sure <code className="text-amber-300 text-xs bg-amber-500/20 px-1 rounded">network_mode: host</code> is set in your compose.yaml so SSDP multicast can reach the network.
              </span>
            ) : (
              <span className="text-amber-200">
                Could not connect to the configured receiver. Check that the receiver is powered on and reachable on your network.
              </span>
            )}
            <a
              href={README_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block mt-1.5 text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              Setup guide →
            </a>
          </div>
        </div>

        {/* Auto-discover */}
        <div className="bg-denon-card border border-denon-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-denon-text">Auto-discover</h2>
              <p className="text-xs text-denon-muted mt-0.5">Scans your network for Denon/Marantz receivers</p>
            </div>
            <button
              onClick={scan}
              disabled={scanning}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-denon-gold text-denon-dark disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              {scanning && <span className="w-3 h-3 border-2 border-denon-dark/30 border-t-denon-dark rounded-full animate-spin" />}
              {scanning ? 'Scanning…' : 'Scan network'}
            </button>
          </div>

          {devices !== null && !scanning && devices.length > 0 && (
            <div className="space-y-2">
              {devices.map(d => (
                <button
                  key={d.ip}
                  onClick={() => connect(d.ip)}
                  disabled={connecting}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-denon-surface border border-denon-border hover:border-denon-gold/50 transition-colors disabled:opacity-50 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-denon-text">{d.model}</p>
                    <p className="text-xs text-denon-muted mt-0.5">
                      {d.ip} · Telnet :{d.telnet_port}
                      {d.heos_available && <span className="ml-1 text-denon-green">· HEOS ✓</span>}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-denon-gold flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manual entry */}
        <div className="bg-denon-card border border-denon-border rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-denon-text">Manual entry</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualIp}
              onChange={e => setManualIp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && manualIp && connect(manualIp)}
              placeholder="192.168.1.100"
              className="flex-1 bg-denon-surface border border-denon-border rounded-xl px-3 py-2 text-sm text-denon-text placeholder-denon-muted focus:outline-none focus:border-denon-gold/50"
            />
            <button
              onClick={() => connect(manualIp)}
              disabled={!manualIp || connecting}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-denon-surface border border-denon-border text-denon-text hover:border-denon-gold/50 disabled:opacity-50 transition-colors"
            >
              {connecting ? '…' : 'Connect'}
            </button>
          </div>
          <p className="text-xs text-denon-muted">
            Find the IP in your router's device list or the receiver's network settings menu.
            You can also set <code className="text-denon-gold/80 text-xs">DENON_DASHBOARD_DENON_HOST</code> in your compose.yaml to skip discovery entirely.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
            {error}
          </div>
        )}

      </div>
    </div>
  )
}
