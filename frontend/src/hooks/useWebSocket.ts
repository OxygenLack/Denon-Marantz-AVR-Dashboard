import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReceiverState, SendCommandFn } from '../types'

const RECONNECT_INITIAL_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
const RECONNECT_JITTER = 500
const WS_CONNECT_TIMEOUT = 1500
const HTTP_FALLBACK_POLL_INTERVAL = 5000

/**
 * Receiver state over the WebSocket, with an HTTP fallback.
 *
 * Raw `fetch` on purpose: this hook runs in App above nothing that could show
 * a toast for it, and a failed status poll is not worth one anyway.
 */
export function useWebSocket(): {
  state: ReceiverState | null
  wsConnected: boolean
  wsConnecting: boolean
  sendCommand: SendCommandFn
} {
  const [state, setState] = useState<ReceiverState | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsConnecting, setWsConnecting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let connectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let lastJson: string | null = null // serialized state, for diffing

    const applyStateJson = (jsonText: string): void => {
      // Only re-render when the payload actually changed (identical pushes,
      // e.g. heartbeat polls, are common).
      if (jsonText === lastJson) return
      try {
        const next = JSON.parse(jsonText) as ReceiverState
        lastJson = jsonText
        setState(next)
      } catch (err) {
        console.warn('Invalid receiver state payload:', err)
      }
    }

    const fetchStatusFallback = async (): Promise<void> => {
      try {
        const res = await fetch('/api/v1/status')
        if (!res.ok) return
        applyStateJson(JSON.stringify(await res.json()))
      } catch (err) {
        console.warn('Status fallback failed:', err)
      }
    }

    const clearConnectTimeout = (): void => {
      if (connectTimeout) clearTimeout(connectTimeout)
      connectTimeout = null
    }

    const scheduleReconnect = (): void => {
      if (closed || reconnectTimer) return
      const base = Math.min(
        RECONNECT_INITIAL_DELAY * 2 ** Math.min(reconnectAttempt, 5),
        RECONNECT_MAX_DELAY,
      )
      reconnectAttempt += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, base + Math.random() * RECONNECT_JITTER)
    }

    function connect(): void {
      if (closed) return
      const current = wsRef.current
      if (current?.readyState === WebSocket.OPEN || current?.readyState === WebSocket.CONNECTING) return

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${window.location.host}/api/v1/ws`)
      wsRef.current = ws
      setWsConnecting(true)

      clearConnectTimeout()
      connectTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.warn('WebSocket connect timeout, retrying')
          try { ws.close() } catch { /* ignore */ }
        }
      }, WS_CONNECT_TIMEOUT)

      ws.onopen = () => {
        clearConnectTimeout()
        // Connected on handshake: the health badge should not wait for the
        // initial state frame that follows.
        setWsConnecting(false)
        setWsConnected(true)
        reconnectAttempt = 0
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      ws.onmessage = (e: MessageEvent<string>) => applyStateJson(e.data)

      ws.onclose = () => {
        clearConnectTimeout()
        if (wsRef.current === ws) wsRef.current = null
        setWsConnected(false)
        setWsConnecting(false)
        scheduleReconnect()
      }

      ws.onerror = () => {
        // The browser emits close after this; reconnect handling lives in onclose.
        try { ws.close() } catch { /* ignore */ }
      }
    }

    // Fetch state immediately: the dashboard shows up fast even when the
    // WebSocket handshake is slow behind a proxy.
    void fetchStatusFallback()
    connect()

    // If a browser/proxy blocks WebSocket, keep the dashboard usable and fresh.
    const pollTimer = setInterval(() => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) void fetchStatusFallback()
    }, HTTP_FALLBACK_POLL_INTERVAL)

    return () => {
      closed = true
      clearInterval(pollTimer)
      clearConnectTimeout()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        try { ws.close() } catch { /* ignore */ }
      }
    }
  }, [])

  const sendCommand = useCallback<SendCommandFn>((command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command }))
      return
    }
    fetch('/api/v1/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })
      .then(res => {
        if (!res.ok) console.warn(`Command fallback ${command} failed (${res.status})`)
      })
      .catch(err => console.warn('Command fallback failed:', err))
  }, [])

  return { state, wsConnected, wsConnecting, sendCommand }
}
