import { useEffect, useMemo, useRef, useState } from 'react'
import type { RadioFavorite } from '../../types'
import { FAVORITES_CID, type NavEntry, type RadioItem } from './constants'

interface Options {
  open: boolean
  favorites: RadioFavorite[]
}

const ROOT_KEY = '__root__'

/**
 * Directory navigation + item fetching with a per-cid cache.
 *
 * The cache only holds what the backend returned. The Favorites folder (at
 * the root) and the Favorites view are derived from `favorites` at render
 * time, so starring a station shows up at once without a refetch.
 */
export function useRadioBrowse({ open, favorites }: Options) {
  const [navStack, setNavStack] = useState<NavEntry[]>([])
  const [fetched, setFetched] = useState<RadioItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const fetchIdRef = useRef(0)
  const cacheRef = useRef<Map<string, RadioItem[]>>(new Map()) // cid → items[]

  const currentTitle = navStack.length > 0 ? navStack[navStack.length - 1].title : 'Internet Radio'
  const currentCid = navStack.length > 0 ? navStack[navStack.length - 1].cid ?? null : null

  // Fetch items — use cache on hit, fetch on miss
  useEffect(() => {
    if (!open) return
    if (currentCid === FAVORITES_CID) {
      setLoading(false)
      setError(null)
      return
    }

    const cacheKey = currentCid ?? ROOT_KEY
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setFetched(cached)
      setLoading(false)
      setError(null)
      return
    }

    const id = ++fetchIdRef.current
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setFetched([])

    const url = currentCid
      ? `/api/v1/media/radio/browse?cid=${encodeURIComponent(currentCid)}`
      : '/api/v1/media/radio/browse'

    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch(url, { signal: controller.signal })
      .then(resp => {
        clearTimeout(timeout)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.json()
      })
      .then((data: { items?: RadioItem[] }) => {
        if (fetchIdRef.current !== id) return
        const items = data.items || []
        cacheRef.current.set(cacheKey, items)
        setFetched(items)
        setLoading(false)
      })
      .catch((err: unknown) => {
        clearTimeout(timeout)
        if (fetchIdRef.current !== id) return
        setError(err instanceof Error && err.name === 'AbortError' ? 'Request timed out' : 'Failed to load stations')
        setFetched([])
        setLoading(false)
      })

    return () => { clearTimeout(timeout); controller.abort() }
  }, [open, currentCid, retryCount])

  const items = useMemo<RadioItem[]>(() => {
    if (currentCid === FAVORITES_CID) return favorites.map(f => ({ ...f, playable: 'yes' }))
    if (currentCid === null && favorites.length > 0) {
      return [{ name: 'Favorites', container: 'yes', cid: FAVORITES_CID }, ...fetched]
    }
    return fetched
  }, [currentCid, favorites, fetched])

  const pushNav = (entry: NavEntry) => setNavStack(prev => [...prev, entry])
  const popNav = () => setNavStack(prev => prev.slice(0, -1))
  const resetNav = () => setNavStack([])
  const retry = () => setRetryCount(c => c + 1)
  const clearCache = () => cacheRef.current.clear()

  return {
    navStack, items, loading, error, setError,
    currentTitle, currentCid,
    pushNav, popNav, resetNav, retry, clearCache,
  }
}
