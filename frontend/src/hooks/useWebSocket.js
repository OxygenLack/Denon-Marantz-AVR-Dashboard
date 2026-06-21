import { useCallback, useEffect, useRef, useState } from 'react'

const RECONNECT_INITIAL_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000
const RECONNECT_JITTER = 500
const WS_CONNECT_TIMEOUT = 1500
const HTTP_FALLBACK_POLL_INTERVAL = 5000

export function useWebSocket() {
  const [state, setState] = useState(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [wsConnecting, setWsConnecting] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const connectTimeoutRef = useRef(null)
  const lastJsonRef = useRef(null) // track serialized state for diffing
  const gotFirstStateRef = useRef(false)
  const manualCloseRef = useRef(false)

  const applyStateJson = useCallback((jsonText) => {
    try {
      // Only trigger React re-render if the state payload actually changed.
      // Avoids unnecessary re-renders from identical WebSocket pushes
      // (e.g. heartbeat polls that return the same state).
      if (jsonText !== lastJsonRef.current) {
        lastJsonRef.current = jsonText
        setState(JSON.parse(jsonText))
      }
      gotFirstStateRef.current = true
    } catch (err) {
      console.warn('Invalid receiver state payload:', err)
    }
  }, [])

  const fetchStatusFallback = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/status')
      if (!res.ok) return
      applyStateJson(JSON.stringify(await res.json()))
    } catch (err) {
      console.warn('Status fallback failed:', err)
    }
  }, [applyStateJson])

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current)
    connectTimeoutRef.current = null
  }, [])

  const scheduleReconnect = useCallback((connectFn) => {
    if (manualCloseRef.current || reconnectTimer.current) return
    const attempt = reconnectAttemptRef.current
    const base = Math.min(
      RECONNECT_INITIAL_DELAY * 2 ** Math.min(attempt, 5),
      RECONNECT_MAX_DELAY,
    )
    const delay = base + Math.random() * RECONNECT_JITTER
    reconnectAttemptRef.current = attempt + 1
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null
      connectFn()
    }, delay)
  }, [])

  const connect = useCallback(() => {
    if (manualCloseRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/v1/ws`

    const ws = new WebSocket(url)
    wsRef.current = ws
    setWsConnecting(true)

    clearConnectTimeout()
    connectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.warn('WebSocket connect timeout, retrying')
        try { ws.close() } catch {}
      }
    }, WS_CONNECT_TIMEOUT)

    ws.onopen = () => {
      clearConnectTimeout()
      setWsConnecting(false)
      // Mark connected immediately on handshake. The initial state frame follows
      // right after, but the health badge should not wait for the next broadcast.
      setWsConnected(true)
      reconnectAttemptRef.current = 0
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
    }

    ws.onmessage = (e) => {
      setWsConnecting(false)
      setWsConnected(true)
      applyStateJson(e.data)
    }

    ws.onclose = () => {
      clearConnectTimeout()
      if (wsRef.current === ws) wsRef.current = null
      setWsConnected(false)
      setWsConnecting(false)
      scheduleReconnect(connect)
    }

    ws.onerror = () => {
      // Browser will emit close after this. Keep reconnect handling in onclose.
      try { ws.close() } catch {}
    }
  }, [applyStateJson, clearConnectTimeout, scheduleReconnect])

  useEffect(() => {
    manualCloseRef.current = false

    // Fetch state immediately. This makes the dashboard visible fast even if
    // WebSocket handshaking is delayed by the browser/proxy.
    fetchStatusFallback()
    connect()

    // If a browser/proxy blocks WebSocket, keep the dashboard usable and fresh.
    const pollTimer = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchStatusFallback()
      }
    }, HTTP_FALLBACK_POLL_INTERVAL)

    return () => {
      manualCloseRef.current = true
      clearInterval(pollTimer)
      clearConnectTimeout()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
        wsRef.current = null
      }
    }
  }, [connect, fetchStatusFallback, clearConnectTimeout])

  const sendCommand = useCallback((command) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command }))
    } else {
      fetch('/api/v1/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      }).catch(err => console.warn('Command fallback failed:', err))
    }
  }, [])

  return { state, wsConnected, wsConnecting, sendCommand }
}
