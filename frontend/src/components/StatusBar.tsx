import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeInUp, FAST, SPRING, PULSE } from '../variants'
import type { ReceiverState } from '../types'

interface Props {
  deviceName: string
  state: ReceiverState
  wsConnected: boolean
  receiverIp?: string
  onOpenThemeModal: () => void
  activeZone?: string
}

export default function StatusBar({ deviceName, state, wsConnected, receiverIp, onOpenThemeModal, activeZone = 'main' }: Props) {
  const [expanded, setExpanded] = useState(false)
  const androidTv = (state.android_tv || {}) as any
  const isAndroidTv = activeZone === 'androidtv'
  const telnetOk = state.connected
  const androidTvOk = androidTv.connected
  const power = state.power
  const ok = (isAndroidTv ? androidTvOk : telnetOk) && wsConnected
  const title = isAndroidTv ? (androidTv.device_name || androidTv.device_info?.model || 'Android TV') : deviceName

  return (
    <div className="status-bar-container">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-denon-text tracking-tight">{title}</h1>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => setExpanded(!expanded)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className={`${ok ? 'badge-green' : 'badge-red'} cursor-pointer hover:brightness-110 transition-all`}
          >
            <motion.span
              className={`w-2 h-2 rounded-full ${ok ? 'bg-denon-green' : 'bg-denon-red'}`}
              animate={ok ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={ok ? PULSE : undefined}
            />
            {ok ? 'Connected' : 'Disconnected'}
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={SPRING}
              style={{ display: 'inline-flex' }}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </motion.div>
          </motion.button>
          <motion.button
            onClick={onOpenThemeModal}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
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
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="health-panel"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={FAST}
            className="mt-2 p-3 bg-denon-surface/50 rounded-xl border border-denon-border/50 text-xs space-y-1.5"
          >
            <div className="flex justify-between">
              <span className="text-denon-muted">Receiver IP</span>
              <span className="text-denon-text font-mono">{receiverIp ?? '—'}</span>
            </div>
            {isAndroidTv && (
              <div className="flex justify-between">
                <span className="text-denon-muted">Android TV IP</span>
                <span className="text-denon-text font-mono">{androidTv.host || '—'}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-denon-muted">Telnet Connection</span>
              <span className={telnetOk ? 'text-denon-green' : 'text-denon-red'}>
                {telnetOk ? '● Connected' : '● Disconnected'}
              </span>
            </div>
            {isAndroidTv && (
              <div className="flex justify-between">
                <span className="text-denon-muted">Android TV Remote</span>
                <span className={androidTvOk ? 'text-denon-green' : 'text-denon-red'}>
                  {androidTvOk ? '● Connected' : '● Disconnected'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-denon-muted">WebSocket</span>
              <span className={wsConnected ? 'text-denon-green' : 'text-denon-red'}>
                {wsConnected ? '● Connected' : '● Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-denon-muted">Power State</span>
              <span className="text-denon-text">{power === true ? 'On' : power === false ? 'Standby' : 'Unknown'}</span>
            </div>
            {isAndroidTv && androidTv.current_app && (
              <div className="flex justify-between gap-3">
                <span className="text-denon-muted">Current App</span>
                <span className="text-denon-text truncate">{androidTv.current_app}</span>
              </div>
            )}
            {!isAndroidTv && state.surround_mode && (
              <div className="flex justify-between">
                <span className="text-denon-muted">Surround Mode</span>
                <span className="text-denon-text">{state.surround_mode}</span>
              </div>
            )}
            {!isAndroidTv && state.eco_mode && (
              <div className="flex justify-between">
                <span className="text-denon-muted">Eco Mode</span>
                <span className="text-denon-text">{state.eco_mode}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
