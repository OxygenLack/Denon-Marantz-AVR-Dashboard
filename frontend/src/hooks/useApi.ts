import { useCallback } from 'react'
import { DEMO_MODE } from '../demoData'
import type { PostFn } from '../types'

export function useApi(): { post: PostFn } {
  const post = useCallback<PostFn>(async (path, body = {}) => {
    if (DEMO_MODE) return { ok: true, status: 200 }
    try {
      const res = await fetch(`/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        console.warn(`API ${path} failed (${res.status}):`, text)
        return { ok: false, status: res.status, error: text }
      }
      return { ok: true, status: res.status }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`API ${path} error:`, err)
      return { ok: false, status: 0, error: message }
    }
  }, [])

  return { post }
}
