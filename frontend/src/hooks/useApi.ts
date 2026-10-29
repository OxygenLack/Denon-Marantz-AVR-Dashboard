import { useCallback, useMemo } from 'react'
import type { ApiResponse, DeleteFn, GetFn, PostFn } from '../types'
import { useToast } from './useToast'

/** "/media/play" -> "Play", "/night-mode/config" -> "Config" */
export function labelFromPath(path: string): string {
  const seg = path.split('?')[0].split('/').filter(Boolean).pop() || 'Request'
  const words = decodeURIComponent(seg).replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

type Method = 'GET' | 'POST' | 'DELETE'

/**
 * The one fetch wrapper for /api/v1. Every failure (HTTP or network) shows a
 * toast and resolves to `{ ok: false }`; it never throws. GET responses carry
 * the parsed JSON body as `data`.
 */
export function useApi(): { post: PostFn; del: DeleteFn; get: GetFn } {
  const { show } = useToast()

  const request = useCallback(async <T,>(method: Method, path: string, body?: object): Promise<ApiResponse & { data?: T }> => {
    try {
      const res = await fetch(`/api/v1${path}`, body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        console.warn(`API ${method} ${path} failed (${res.status}):`, text)
        show({ kind: 'error', text: `${labelFromPath(path)} failed (${res.status})` })
        return { ok: false, status: res.status, error: text }
      }
      if (method === 'GET') {
        return { ok: true, status: res.status, data: await res.json() as T }
      }
      return { ok: true, status: res.status }
    } catch (err) {
      console.warn(`API ${method} ${path} error:`, err)
      show({ kind: 'error', text: `${labelFromPath(path)} failed (network)` })
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
    }
  }, [show])

  const post = useCallback<PostFn>((path, body = {}) => request('POST', path, body), [request])
  const del = useCallback<DeleteFn>(path => request('DELETE', path), [request])
  const get = useCallback(<T,>(path: string) => request<T>('GET', path), [request]) as GetFn

  return useMemo(() => ({ post, del, get }), [post, del, get])
}
