export type Zone = 'main' | 'zone2'

export type ThemeName =
  | 'gold' | 'blue' | 'red' | 'green'
  | 'olive' | 'violet' | 'purple' | 'pink' | 'orange'

export interface Theme {
  label: string
  accent: string
  accentDim: string
}

export interface NowPlaying {
  song?: string
  artist?: string
  station?: string
  image_url?: string
}

export interface SurroundModeEntry {
  id: number
  category: string
  command: string
  display_name: string
  active?: boolean
}

export interface ThemeConfig {
  base: ThemeName
  overrides: Record<string, string>
}

export interface AndroidTvState {
  configured: boolean
  connected: boolean
  paired: boolean
  pairing: boolean
  available: boolean
  host: string | null
  device_name: string | null
  device_mac: string | null
  device_info: Record<string, any> | null
  is_on: boolean | null
  current_app: string | null
  volume: number | null
  volume_max: number | null
  muted: boolean | null
  error: string | null
}

export interface AndroidAdbDiagnostics {
  ping?: boolean
  storage?: {
    size_kb: number
    used_kb: number
    available_kb: number
    used_percent: string
  } | null
  wifi_ip?: string | null
  last_error?: string | null
}

export interface AndroidAdbState {
  enabled: boolean
  adb_available: boolean | null
  host: string | null
  port: number
  serial: string | null
  connected: boolean
  authorized: boolean
  state: string | null
  model: string | null
  android_version: string | null
  build: string | null
  resolution: string | null
  current_app: {
    package: string | null
    activity: string | null
    name: string | null
  } | null
  diagnostics: AndroidAdbDiagnostics
  last_error: string | null
}

export interface ReceiverState {
  surround_mode_list?: SurroundModeEntry[]
  connected: boolean
  discovering?: boolean
  power?: boolean
  volume?: number
  volume_max?: number
  muted?: boolean
  source?: string
  surround_mode?: string
  channel_volumes?: Record<string, number>
  speaker_calibration?: Record<string, number>
  dynamic_eq?: boolean
  dynamic_volume?: string
  multeq?: string
  ref_level_offset?: number
  sleep_timer?: number
  eco_mode?: string
  tone_control?: boolean
  bass?: number
  treble?: number
  subwoofer_level?: number
  now_playing?: NowPlaying
  play_state?: 'play' | 'pause' | 'stop'
  stream_quality?: string
  z2_power?: boolean
  z2_volume?: number
  z2_muted?: boolean
  z2_source?: string
  source_name?: string
  z2_source_name?: string
  heos_source?: string
  theme_config?: ThemeConfig
  android_tv?: AndroidTvState
  android_adb?: AndroidAdbState
}

export interface SourceEntry {
  id: string
  name: string
}

export interface DeviceInfo {
  device_name?: string
  zone1_name?: string
  zone2_name?: string
  theme?: ThemeName
  receiver_ip?: string
  discovering?: boolean
  channel_names?: Record<string, string>
  source_name_map?: Record<string, string>
  sources?: (string | SourceEntry)[]
}

export interface ApiResponse {
  ok: boolean
  status: number
  error?: string
}

export type PostFn = (path: string, body?: Record<string, unknown>) => Promise<ApiResponse>

export type SendCommandFn = (command: string) => void

export interface SoundModeEntry {
  speakers: string
  description: string
  bestFor: string
  notes?: string
}
