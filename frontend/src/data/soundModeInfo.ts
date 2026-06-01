import type { SoundModeEntry } from '../types'

const MODES: Record<string, SoundModeEntry> = {
  // ── Direct / Pure ──────────────────────────────────────────────
  'Direct': {
    speakers: 'Front L/R (+ Sub only with multichannel LFE)',
    description: 'Plays audio as recorded. Bypasses Audyssey, EQ, tone controls, and bass management. Video circuits remain active.',
    bestFor: 'Stereo music — unprocessed playback',
    notes: 'Sub is silent on 2ch sources (no bass management). Display stays on.',
  },
  'Pure Direct': {
    speakers: 'Front L/R (+ Sub only with multichannel LFE)',
    description: 'Shortest signal path. Same as Direct but also shuts off display and analog video circuits to reduce electrical noise.',
    bestFor: 'Audiophile / critical listening sessions',
    notes: 'Display turns off after ~5s. Lowest noise floor of any mode. Disables Audyssey.',
  },

  // ── Stereo ─────────────────────────────────────────────────────
  'Stereo': {
    speakers: 'Front L/R, Subwoofer',
    description: 'Standard 2-channel playback with full Audyssey room correction, bass management, and crossover active.',
    bestFor: 'Music, TV, casual listening',
    notes: 'Default stereo mode. Sub is active via crossover. Multichannel inputs are downmixed to 2ch.',
  },
  'Multi Ch Stereo': {
    speakers: 'All connected speakers',
    description: 'Sends the stereo signal to every connected speaker equally.',
    bestFor: 'Background music, parties, filling a room',
    notes: 'Same signal to all speakers. Not for critical listening.',
  },

  // ── Auto ───────────────────────────────────────────────────────
  'Auto': {
    speakers: 'All speakers (source-matched + upmix)',
    description: 'Detects input format and selects the appropriate decoder automatically. Applies Dolby Surround or DTS Neural:X upmixer to fill all speakers.',
    bestFor: 'General "set and forget" for movies and TV',
    notes: 'Always upmixes to use all speakers. 2ch analog/PCM defaults to stereo.',
  },

  // ── Dolby ──────────────────────────────────────────────────────
  'Dolby Atmos': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Height/Atmos speakers, Sub',
    description: 'Decodes Dolby Atmos object-based audio. Positions sounds in 3D space using object metadata.',
    bestFor: 'Dolby Atmos movies and streaming (Netflix, Disney+, Apple TV+)',
    notes: 'Requires Atmos-encoded content. Speaker Virtualizer available without physical height speakers.',
  },
  'Dolby TrueHD': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Lossless high-definition codec, bit-for-bit identical to the studio master. Up to 8 channels at 96kHz/24-bit.',
    bestFor: 'Blu-ray disc movies',
    notes: 'Lossless. Often carries Atmos metadata as a spatial layer on top.',
  },
  'Dolby Digital Plus': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Enhanced Dolby Digital with higher bitrate, up to 7.1 discrete channels. Lossy but improved over DD.',
    bestFor: 'Streaming services, digital broadcasts',
    notes: 'Common streaming format. Can carry Atmos metadata.',
  },
  'Dolby Digital': {
    speakers: 'Front L/R, Center, Surround L/R, Sub (5.1)',
    description: 'Original multi-channel digital format. Up to 5.1 channels of lossy compressed audio.',
    bestFor: 'DVD movies, broadcast TV, older Blu-rays',
    notes: 'Legacy standard. 5.1 max, 640 kbps max bitrate.',
  },
  'Dolby Surround': {
    speakers: 'All connected speakers (incl. Heights)',
    description: 'Upmixer that intelligently expands any source (stereo, 5.1, 7.1) to fill all connected speakers including height/Atmos channels.',
    bestFor: 'Upmixing stereo or 5.1 content to use all speakers',
    notes: 'Successor to Dolby Pro Logic. Shown as "+DSurr" suffix on display.',
  },
  'Dolby Audio - Dolby Surround': {
    speakers: 'All connected speakers (incl. Heights)',
    description: 'Dolby\'s surround upmixer — expands any source to fill all connected speakers including height channels.',
    bestFor: 'Upmixing stereo or 5.1 to full surround',
    notes: 'Shown as "Dolby Audio - Dolby Surround" on some receivers. Same as Dolby Surround.',
  },
  'Dolby Audio - Dolby Digital': {
    speakers: 'Front L/R, Center, Surround L/R, Sub (5.1)',
    description: 'Dolby Digital decoding — standard 5.1 lossy surround.',
    bestFor: 'DVD, broadcast TV, streaming',
    notes: 'Displayed when receiving a Dolby Digital bitstream.',
  },
  'Dolby Audio - DD+': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Dolby Digital Plus decoding with higher bitrate and up to 7.1 channels.',
    bestFor: 'Streaming services (Netflix, Disney+)',
    notes: 'Can carry Atmos metadata for streaming Atmos content.',
  },
  'Dolby Audio - TrueHD': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Lossless Dolby TrueHD decoding — bit-perfect studio master audio.',
    bestFor: 'Blu-ray movies',
    notes: 'Lossless. May contain Atmos metadata layer.',
  },
  'Dolby Audio - Dolby TrueHD/Atmos': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Height speakers, Sub',
    description: 'Dolby TrueHD with Atmos object metadata — lossless 3D immersive audio.',
    bestFor: 'Atmos Blu-ray discs',
    notes: 'Highest quality Atmos experience. Requires TrueHD+Atmos encoded disc.',
  },

  // ── DTS ────────────────────────────────────────────────────────
  'DTS:X': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Height speakers, Sub',
    description: 'Object-based immersive audio (DTS equivalent of Dolby Atmos). Positions sounds in 3D using object metadata.',
    bestFor: 'DTS:X encoded Blu-ray movies',
    notes: 'Requires DTS:X encoded content. Height speakers recommended.',
  },
  'DTS-HD': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Lossless (Master Audio) or high-resolution codec for Blu-ray. Bit-for-bit identical to studio master.',
    bestFor: 'Blu-ray movies with DTS-HD tracks',
    notes: 'Lossless when DTS-HD Master Audio. Core-compatible with standard DTS.',
  },
  'DTS-HD Master Audio': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (up to 7.1)',
    description: 'Lossless high-definition DTS codec — studio master quality.',
    bestFor: 'Blu-ray movies',
    notes: 'Lossless. Falls back to DTS core on incompatible hardware.',
  },
  'DTS Surround': {
    speakers: 'Front L/R, Center, Surround L/R, Sub (5.1)',
    description: 'Standard DTS 5.1 digital surround. Higher bitrate than Dolby Digital.',
    bestFor: 'DVD movies, some Blu-rays',
    notes: '1.5 Mbps typical. Often described as warmer than Dolby Digital.',
  },
  'DTS Neural:X': {
    speakers: 'All connected speakers (incl. Heights)',
    description: 'DTS upmixer that expands any source to fill all connected speakers. More aggressive/discrete than Dolby Surround.',
    bestFor: 'Upmixing stereo or 5.1 to full surround',
    notes: 'Shown as "+Neural:X" suffix. Cannot be applied to Dolby-encoded content on some models.',
  },
  'DTS Virtual:X': {
    speakers: 'Front L/R, Center, Sub (virtualizes Surround + Heights)',
    description: 'Simulates surround and height speakers using psychoacoustic processing when physical speakers are absent.',
    bestFor: 'Systems without surround or height speakers',
    notes: 'Virtualizer, NOT an upmixer. Disables Audyssey. Cannot be used with Dolby content or when height speakers are connected.',
  },

  // ── Auro-3D ───────────────────────────────────────────────────
  'Auro-3D': {
    speakers: 'Front L/R, Center, Surround L/R, Front Height L/R, Surr. Height L/R, Top, Sub',
    description: 'Decodes native Auro-3D 3-layer audio (ear/height/top). Automatically applies Auro-Matic upmixer to non-Auro content.',
    bestFor: 'Native Auro-3D content, or music with height speakers',
    notes: 'Widely considered the best upmixer for music. Auro-Matic strength adjustable 1-16. Available on X3800H+.',
  },
  'Auro-2D Surround': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub (ear-level only)',
    description: 'Auro-3D processing for surround without height channels. Applies Auro-Matic at ear level.',
    bestFor: 'Systems without height speakers wanting Auro processing',
    notes: 'Choose this when you have no height speakers but want Auro sound.',
  },

  // ── DSP / Venue Modes ──────────────────────────────────────────
  'Rock Arena': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub',
    description: 'Simulates a large live concert arena with expansive reverb. Reflected sounds from all directions.',
    bestFor: 'Rock/pop music, concert recordings',
    notes: 'DSP adds synthetic reverb. Not available with height speakers.',
  },
  'Jazz Club': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub',
    description: 'Simulates an intimate jazz club with low ceiling and hard walls. Close, warm acoustic space.',
    bestFor: 'Jazz, acoustic music, small ensemble recordings',
    notes: 'More intimate than Rock Arena. Not available with height speakers.',
  },
  'Mono Movie': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub',
    description: 'Expands monaural audio into surround sound. Designed for classic mono films.',
    bestFor: 'Old mono movies, classic films',
    notes: 'Not available with height speakers.',
  },
  'Video Game': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub',
    description: 'Dynamic surround optimized for action games. Emphasizes directional cues and impact.',
    bestFor: 'Action/FPS video games',
    notes: 'Not available with height speakers.',
  },
  'Matrix': {
    speakers: 'Front L/R, Center, Surround L/R, SB L/R, Sub',
    description: 'Basic matrix decoder — creates surround from stereo using the L-R difference signal for surround channels.',
    bestFor: 'Stereo music with simple surround fill',
    notes: 'Simpler algorithm than Dolby Surround / Neural:X. Not available with height speakers.',
  },
  'Virtual': {
    speakers: 'Front L/R only (or headphones)',
    description: 'Simulates surround sound using only front L/R speakers or headphones via psychoacoustic processing.',
    bestFor: 'Headphone listening, 2-speaker setups',
    notes: 'The only DSP mode usable with headphones. Does NOT use surround/center/height speakers.',
  },

  // ── Multi-Channel Input ────────────────────────────────────────
  'Multi Ch In': {
    speakers: 'Matches input channels (up to 7.1+)',
    description: 'Passes through multi-channel PCM or DSD input directly without re-encoding.',
    bestFor: 'SACD, DVD-Audio, Blu-ray PCM, game consoles sending LPCM',
    notes: 'Pure passthrough. No upmixing or processing applied.',
  },
}

const UPPER_MAP: Record<string, SoundModeEntry> = {}
for (const [key, val] of Object.entries(MODES)) {
  UPPER_MAP[key.toUpperCase()] = val
}

const ALIASES: Record<string, SoundModeEntry> = {
  'MCH STEREO': MODES['Multi Ch Stereo'],
  'PURE DIRECT': MODES['Pure Direct'],
  'DTS SURROUND': MODES['DTS Surround'],
  'DOLBY SURROUND': MODES['Dolby Surround'],
  'DOLBY DIGITAL': MODES['Dolby Digital'],
  'DOLBY ATMOS': MODES['Dolby Atmos'],
}

export function getModeInfo(displayName: string): SoundModeEntry | null {
  if (!displayName) return null
  return MODES[displayName]
    ?? UPPER_MAP[displayName.toUpperCase()]
    ?? ALIASES[displayName.toUpperCase()]
    ?? null
}

export default MODES
