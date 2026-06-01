import { useState } from 'react'
import { motion } from 'framer-motion'
import { SPIN } from '../variants'

interface DiscoveredDevice {
  ip: string
  model: string
  telnet_port: number
  heos_available?: boolean
}

interface Props {
  reason?: string
  onConnect: (ip: string) => void
  onOpenThemeModal: () => void
  embedded?: boolean
}

const README_URL = 'https://github.com/mondychan/Denon-Marantz-AVR-Dashboard#quick-start-docker'

export default function ReceiverSetup({ reason, onConnect, onOpenThemeModal, embedded = false }: Props) {
  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<DiscoveredDevice[] | null>(null)
  const [manualIp, setManualIp] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scan = async () => {
    setScanning(true); setDevices(null); setError(null)
    try {
      const res = await fetch('/api/v1/discover')
      const data = await res.json() as { devices?: DiscoveredDevice[] }
      setDevices(data.devices ?? [])
      if ((data.devices ?? []).length === 0) {
        setError('No receivers found. SSDP auto-discovery requires network_mode: host in your compose.yaml. See the setup guide below.')
      }
    } catch {
      setError('Scan failed — the backend may not be reachable.')
    } finally {
      setScanning(false)
    }
  }

  const connect = async (ip: string) => {
    setConnecting(true); setError(null)
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
    <div className={`${embedded ? 'flex items-start justify-center py-2' : 'min-h-screen flex items-center justify-center bg-denon-dark p-6'} relative`}>
      {!embedded && (
      <div className="absolute top-4 right-4">
        <motion.button
          onClick={onOpenThemeModal}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-denon-muted hover:text-denon-text hover:bg-denon-surface/70 transition-all"
          title="Theme settings"
          aria-label="Theme settings"
        >
          <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </motion.button>
      </div>
      )}
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-denon-card border border-denon-border flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-denon-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-denon-text">Denon Dashboard</h1>
          <p className="text-denon-muted text-sm mt-1">No receiver connected</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div className="text-sm">
            {reason === 'no_host' ? (
              <span className="text-amber-200">
                Auto-discovery found no receivers. Make sure <code className="text-amber-300 text-xs bg-amber-500/20 px-1 rounded">network_mode: host</code> is set in your compose.yaml.
              </span>
            ) : (
              <span className="text-amber-200">
                Could not connect to the configured receiver. Check that the receiver is powered on and reachable.
              </span>
            )}
            <a href={README_URL} target="_blank" rel="noopener noreferrer"
               className="block mt-1.5 text-amber-400 hover:text-amber-300 underline underline-offset-2">
              Setup guide →
            </a>
          </div>
        </div>

        <div className="bg-denon-card border border-denon-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-denon-text">Auto-discover</h2>
              <p className="text-xs text-denon-muted mt-0.5">Scans your network for Denon/Marantz receivers</p>
            </div>
            <motion.button
              onClick={scan}
              disabled={scanning}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-denon-gold text-denon-dark disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              {scanning && (
                <motion.span
                  className="w-3 h-3 border-2 border-denon-dark/30 border-t-denon-dark rounded-full"
                  animate={{ rotate: 360 }}
                  transition={SPIN}
                />
              )}
              {scanning ? 'Scanning…' : 'Scan network'}
            </motion.button>
          </div>
          {devices != null && !scanning && devices.length > 0 && (
            <div className="space-y-2">
              {devices.map(d => (
                <motion.button
                  key={d.ip}
                  onClick={() => connect(d.ip)}
                  disabled={connecting}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
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
                </motion.button>
              ))}
            </div>
          )}
        </div>

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
            <motion.button
              onClick={() => connect(manualIp)}
              disabled={!manualIp || connecting}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-denon-surface border border-denon-border text-denon-text hover:border-denon-gold/50 disabled:opacity-50 transition-colors"
            >
              {connecting ? '…' : 'Connect'}
            </motion.button>
          </div>
          <p className="text-xs text-denon-muted">
            Find the IP in your router's device list or the receiver's network settings menu.
            You can also set <code className="text-denon-gold/80 text-xs">DENON_DASHBOARD_DENON_HOST</code> in your compose.yaml to skip discovery.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
