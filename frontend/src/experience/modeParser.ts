import type { ReceiverState } from '../types'

type ModeFamily = 'dolby' | 'dts' | 'pcm' | 'stereo' | 'direct'

interface ModePattern {
  test: RegExp
  codec: string
  family: ModeFamily
}

interface UpmixPattern {
  test: RegExp
  upmixer: string
}

export interface ParsedSurroundMode {
  raw: string
  codec: string
  upmixer: string | null
  family: ModeFamily | 'unknown'
  color: string
}

export interface AmbientDescriptor {
  color: string
  intensity: number
  mood: string
}

const MODE_PATTERNS: ModePattern[] = [
  { test: /DD\+|DOLBY DIGITAL PLUS/i, codec: 'Dolby Digital Plus', family: 'dolby' },
  { test: /DOLBY DIGITAL(?! PLUS)/i, codec: 'Dolby Digital', family: 'dolby' },
  { test: /TRUEHD/i, codec: 'Dolby TrueHD', family: 'dolby' },
  { test: /ATMOS/i, codec: 'Dolby Atmos', family: 'dolby' },
  { test: /DTS-HD MASTER/i, codec: 'DTS-HD MA', family: 'dts' },
  { test: /DTS-HD/i, codec: 'DTS-HD', family: 'dts' },
  { test: /DTS:X/i, codec: 'DTS:X', family: 'dts' },
  { test: /DTS/i, codec: 'DTS', family: 'dts' },
  { test: /MULTI CH|MCH/i, codec: 'Multi Ch PCM', family: 'pcm' },
  { test: /STEREO/i, codec: 'Stereo', family: 'stereo' },
  { test: /DIRECT/i, codec: 'Direct', family: 'direct' },
]

const UPMIX_PATTERNS: UpmixPattern[] = [
  { test: /\+DSUR|DOLBY SURROUND/i, upmixer: 'Dolby Surround' },
  { test: /\+NEURAL:X|NEURAL:X/i, upmixer: 'DTS Neural:X' },
  { test: /VIRTUAL:X/i, upmixer: 'DTS Virtual:X' },
  { test: /AURO/i, upmixer: 'Auro-Matic' },
]

const FAMILY_COLORS: Record<ModeFamily | 'unknown', string> = {
  dolby: '#3B82F6',
  dts: '#F97316',
  pcm: '#22C55E',
  stereo: '#8B5CF6',
  direct: '#C5A55A',
  unknown: '#C5A55A',
}

export function parseSurroundMode(mode: string | null | undefined): ParsedSurroundMode {
  const raw = mode || ''
  const codecMatch = MODE_PATTERNS.find(p => p.test.test(raw))
  const upmixMatch = UPMIX_PATTERNS.find(p => p.test.test(raw))

  return {
    raw,
    codec: codecMatch?.codec || (raw ? raw : 'Unknown'),
    upmixer: upmixMatch?.upmixer || null,
    family: codecMatch?.family || 'unknown',
    color: FAMILY_COLORS[codecMatch?.family || 'unknown'],
  }
}

export function ambientFromState(state: ReceiverState | null | undefined): AmbientDescriptor {
  const parsed = parseSurroundMode(state?.surround_mode)
  if (!state?.connected) return { color: '#EF4444', intensity: 0.18, mood: 'disconnected' }
  if (!state?.power) return { color: '#334155', intensity: 0.12, mood: 'standby' }
  if (state?.night_mode_enabled) return { color: '#8B5CF6', intensity: 0.28, mood: 'night' }
  if (state?.muted) return { color: '#64748B', intensity: 0.14, mood: 'muted' }
  if (state?.play_state === 'play') return { color: parsed.color, intensity: 0.36, mood: 'playing' }
  return { color: parsed.color, intensity: 0.24, mood: parsed.family }
}
