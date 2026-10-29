import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRadioBrowse } from './useRadioBrowse'
import type { RadioFavorite } from '../../types'

describe('useRadioBrowse', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('shows the Favorites folder as soon as a favorite exists, without a refetch', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({ items: [{ name: 'Music', container: 'yes', cid: 'c1' }] }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ favorites }) => useRadioBrowse({ open: true, favorites }),
      { initialProps: { favorites: [] as RadioFavorite[] } },
    )
    await waitFor(() => expect(result.current.items.map(i => i.name)).toEqual(['Music']))

    rerender({ favorites: [{ mid: 's1', name: 'Radio One' }] })
    expect(result.current.items.map(i => i.name)).toEqual(['Favorites', 'Music'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('derives the Favorites view from the favorites list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })))
    const favorites: RadioFavorite[] = [{ mid: 's1', name: 'Radio One' }]
    const { result } = renderHook(() => useRadioBrowse({ open: true, favorites }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const folder = result.current.items[0]
    result.current.pushNav({ title: 'Favorites', cid: folder.cid })
    await waitFor(() => expect(result.current.items).toEqual([{ mid: 's1', name: 'Radio One', playable: 'yes' }]))
  })
})
