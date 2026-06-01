import type { ReceiverState, DeviceInfo } from './types'

export const DEMO_MODE: boolean =
  new URLSearchParams(window.location.search).has('demo') ||
  import.meta.env.VITE_DEMO_MODE === 'true'

export const DEMO_DEVICE_INFO: DeviceInfo = {
  device_name: 'Demo AVR',
  zone1_name: 'Main Zone',
  zone2_name: 'Zone 2',
  receiver_ip: '192.168.1.100',
  discovering: false,
  theme: 'gold',
  channel_names: {
    FL: 'Front L', FR: 'Front R', C: 'Center', SW: 'Subwoofer',
    SL: 'Surround L', SR: 'Surround R',
  },
  source_name_map: {
    GAME: 'Game Console', TV: 'TV Audio', NET: 'Online Music',
    BD: 'Blu-ray', MPLAY: 'Media Player', BT: 'Bluetooth', IRADIO: 'Internet Radio',
  },
  sources: ['GAME', 'TV', 'NET', 'BD', 'MPLAY', 'BT', 'IRADIO'],
}

export const DEMO_STATE: ReceiverState = {
  connected: true,
  discovering: false,
  power: true,
  volume: 45.0,
  volume_max: 98.0,
  muted: false,
  source: 'GAME',
  surround_mode: 'DOLBY DIGITAL',
  channel_volumes: { FL: 50, FR: 50, C: 50, SL: 50, SR: 50, SW: 50 },
  speaker_calibration: { FL: -1.5, FR: -1.5, C: -2.0, SL: -3.0, SR: -3.0, SW: 0.0 },
  tone_control: true,
  bass: 50,
  treble: 50,
  subwoofer_level: 50,
  multeq: 'AUDYSSEY',
  dynamic_eq: true,
  dynamic_volume: 'MED',
  ref_level_offset: 0,
  eco_mode: 'AUTO',
  z2_power: false,
  z2_volume: 30,
  z2_muted: false,
  z2_source: 'TV',
  now_playing: { artist: 'Demo Artist', song: 'Demo Track', station: undefined },
  play_state: 'play',
  theme_config: { base: 'gold', overrides: {} },
  surround_mode_list: [
    { category: 'MOV', id: 1, active: true,  display_name: 'Dolby Digital',   command: 'DOLBY DIGITAL' },
    { category: 'MOV', id: 2, active: false, display_name: 'Dolby Atmos',     command: 'DOLBY ATMOS' },
    { category: 'MOV', id: 3, active: false, display_name: 'DTS:X',           command: 'DTS:X' },
    { category: 'MUS', id: 4, active: false, display_name: 'Stereo',          command: 'STEREO' },
    { category: 'MUS', id: 5, active: false, display_name: 'Multi Ch Stereo', command: 'MCH STEREO' },
    { category: 'MUS', id: 6, active: false, display_name: 'DTS Neural:X',    command: 'NEURAL:X' },
    { category: 'GAM', id: 7, active: false, display_name: 'Video Game',      command: 'VIDEO GAME' },
    { category: 'PUR', id: 8, active: false, display_name: 'Direct',          command: 'DIRECT' },
    { category: 'PUR', id: 9, active: false, display_name: 'Pure Direct',     command: 'PURE DIRECT' },
  ],
}

const Z2_SPECIAL = new Set(['Z2ON', 'Z2OFF', 'Z2MUON', 'Z2MUOFF', 'Z2UP', 'Z2DOWN'])

export function applyDemoCommand(state: ReceiverState, command: string): ReceiverState {
  const s = { ...state }

  if (command === 'ZMON') { s.power = true; return s }
  if (command === 'ZMOFF') { s.power = false; return s }
  if (command === 'MVUP') { s.volume = Math.min(s.volume_max ?? 98, Math.round(((s.volume ?? 0) + 0.5) * 10) / 10); return s }
  if (command === 'MVDOWN') { s.volume = Math.max(0, Math.round(((s.volume ?? 0) - 0.5) * 10) / 10); return s }
  if (/^MV\d+$/.test(command)) {
    const raw = command.slice(2)
    s.volume = raw.length === 3 ? parseInt(raw) / 10 : parseInt(raw)
    return s
  }
  if (command === 'MUON') { s.muted = true; return s }
  if (command === 'MUOFF') { s.muted = false; return s }
  if (command.startsWith('SI') && command.length > 2) { s.source = command.slice(2); return s }
  if (command.startsWith('MS') && command.length > 2) {
    const mode = command.slice(2)
    s.surround_mode = mode
    s.surround_mode_list = s.surround_mode_list?.map(m => ({ ...m, active: m.command === mode }))
    return s
  }
  if (command === 'Z2ON') { s.z2_power = true; return s }
  if (command === 'Z2OFF') { s.z2_power = false; return s }
  if (command === 'Z2MUON') { s.z2_muted = true; return s }
  if (command === 'Z2MUOFF') { s.z2_muted = false; return s }
  if (command === 'Z2UP') { s.z2_volume = Math.min(98, (s.z2_volume ?? 30) + 1); return s }
  if (command === 'Z2DOWN') { s.z2_volume = Math.max(0, (s.z2_volume ?? 30) - 1); return s }
  if (/^Z2\d+$/.test(command)) { s.z2_volume = parseInt(command.slice(2)); return s }
  if (command.startsWith('Z2') && !Z2_SPECIAL.has(command)) { s.z2_source = command.slice(2); return s }
  if (command === 'PSTONE CTRL ON') { s.tone_control = true; return s }
  if (command === 'PSTONE CTRL OFF') { s.tone_control = false; return s }
  if (command.startsWith('PSBAS ')) { s.bass = parseInt(command.slice(6)); return s }
  if (command.startsWith('PSTRE ')) { s.treble = parseInt(command.slice(6)); return s }
  if (command.startsWith('PSSWL ')) { s.subwoofer_level = parseInt(command.slice(6)); return s }
  if (command.startsWith('PSMULTEQ:')) { s.multeq = command.slice(9); return s }
  if (command === 'PSDYNEQ ON') { s.dynamic_eq = true; return s }
  if (command === 'PSDYNEQ OFF') { s.dynamic_eq = false; return s }
  if (command.startsWith('PSDYNVOL ')) { s.dynamic_volume = command.slice(9); return s }
  if (command.startsWith('PSREFLEV ')) { s.ref_level_offset = parseInt(command.slice(9)); return s }
  if (command.startsWith('ECO')) { s.eco_mode = command.slice(3); return s }
  const cvMatch = command.match(/^CV([A-Z0-9]+) (\d+)$/)
  if (cvMatch) {
    s.channel_volumes = { ...s.channel_volumes, [cvMatch[1]]: parseInt(cvMatch[2]) }
    return s
  }
  if (command === 'CVZRL') {
    s.channel_volumes = Object.fromEntries(Object.keys(s.channel_volumes ?? {}).map(k => [k, 50]))
    return s
  }

  return s
}
