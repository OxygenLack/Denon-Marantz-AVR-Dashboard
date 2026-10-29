import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MediaControls, { HEOS_OFFLINE_HINT } from './MediaControls'
import type { ReceiverState } from '../types'

const base: ReceiverState = {
  connected: true,
  power: true,
  source: 'NET',
  now_playing: { song: 'Midnight City', artist: 'M83' },
  play_state: 'play',
}

const MEDIA = ['NET', 'BT', 'MPLAY']

const okPost = () => vi.fn(async () => ({ ok: true, status: 200 }))

describe('MediaControls', () => {
  it('disables transport buttons and shows the hint when HEOS is down', () => {
    render(<MediaControls state={{ ...base, heos_connected: false }} post={okPost()} mediaSources={MEDIA} />)
    for (const title of ['Previous', 'Pause', 'Next']) {
      expect(screen.getByTitle(title)).toBeDisabled()
    }
    expect(screen.getByText(HEOS_OFFLINE_HINT)).toBeInTheDocument()
  })

  it('keeps buttons enabled and hides the hint when HEOS is up', () => {
    render(<MediaControls state={{ ...base, heos_connected: true }} post={okPost()} mediaSources={MEDIA} />)
    expect(screen.getByTitle('Pause')).toBeEnabled()
    expect(screen.queryByText(HEOS_OFFLINE_HINT)).not.toBeInTheDocument()
  })

  it('treats a missing heos_connected field as up (older backends)', () => {
    render(<MediaControls state={base} post={okPost()} mediaSources={MEDIA} />)
    expect(screen.getByTitle('Next')).toBeEnabled()
  })

  it('renders nothing before /device delivered the media sources', () => {
    const { container } = render(<MediaControls state={base} post={okPost()} mediaSources={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a non-media source', () => {
    const { container } = render(<MediaControls state={{ ...base, source: 'TV' }} post={okPost()} mediaSources={MEDIA} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sends transport actions through post()', () => {
    const post = okPost()
    render(<MediaControls state={base} post={post} mediaSources={MEDIA} />)
    fireEvent.click(screen.getByTitle('Next'))
    fireEvent.click(screen.getByTitle('Pause'))
    expect(post).toHaveBeenCalledWith('/media/next')
    expect(post).toHaveBeenCalledWith('/media/pause')
  })

  it('labels a stopped player as Stopped', () => {
    render(<MediaControls state={{ ...base, play_state: 'stop' }} post={okPost()} mediaSources={MEDIA} />)
    expect(screen.getByText('■ Stopped')).toBeInTheDocument()
  })
})
