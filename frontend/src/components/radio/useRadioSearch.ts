import { useEffect, useRef, useState } from 'react'
import type { RadioItem } from './constants'

/**
 * Backend search over the preloaded station cache. `cachedCount` comes from
 * the radio status (polled while the preload runs); a change re-runs the
 * current search so results grow as the cache fills.
 */
export function useRadioSearch(cachedCount: number) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<RadioItem[] | null>(null)
  const [searchInfo, setSearchInfo] = useState('')
  const searchAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults(null)
      setSearchInfo('')
      return
    }
    if (searchAbortRef.current) searchAbortRef.current.abort()
    const controller = new AbortController()
    searchAbortRef.current = controller

    const timer = setTimeout(() => {
      fetch(`/api/v1/media/radio/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => r.json())
        .then((data: { results?: RadioItem[]; cached_stations?: number }) => {
          if (!controller.signal.aborted) {
            setSearchResults(data.results || [])
            setSearchInfo(`${data.results?.length || 0} of ${data.cached_stations || 0} stations`)
          }
        })
        .catch(() => {})
    }, 150) // debounce

    return () => { clearTimeout(timer); controller.abort() }
  }, [searchQuery, cachedCount]) // re-search when the cache grows

  return {
    searchQuery, setSearchQuery, searchResults, searchInfo,
    isSearching: searchResults !== null,
  }
}
