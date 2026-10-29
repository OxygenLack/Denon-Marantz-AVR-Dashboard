// Shared TypeScript types — single source of truth for the frontend.
// ReceiverState mirrors the backend StatusResponse (build_status / WS payload);
// DeviceInfo mirrors DeviceInfoResponse (GET /api/v1/device). Keep both in sync
// with backend/api/models.py.

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
  album?: string
  station?: string
  image_url?: string
  [key: string]: unknown
}

export interface SurroundModeEntry {
  id: number | string
  category: string
  category_label?: string
  command: string
  display_name: string
  active?: boolean
}

// Mirrors backend StatusResponse — the WebSocket state payload.
// Fields are optional because the receiver populates them incrementally; the
// raw JSON frame is narrowed to ReceiverState at the WebSocket boundary.
export interface ReceiverState {
  connected: boolean
  heos_connected?: boolean
  discovering?: boolean
  // Plain string: the backend validates names, getTheme() falls back on unknown ones.
  theme?: string
  power?: boolean
  volume?: number
  volume_max?: number
  muted?: boolean
  source?: string
  source_name?: string
  heos_source?: string
  surround_mode?: string
  surround_mode_list?: SurroundModeEntry[]
  sound_decoder?: string
  channel_volumes?: Record<string, number>
  speaker_calibration?: Record<string, number>
  tone_control?: boolean
  bass?: number
  treble?: number
  subwoofer_level?: number
  subwoofer2_level?: number
  dialog_level?: number
  dialog_level_enabled?: boolean
  multeq?: string
  dynamic_eq?: boolean
  dynamic_volume?: string
  ref_level_offset?: number
  sleep_timer?: number
  night_mode_enabled?: boolean
  night_mode_snapshot?: Record<string, number>
  eco_mode?: string
  z2_power?: boolean
  z2_volume?: number
  z2_muted?: boolean
  z2_sleep_timer?: number
  z2_source?: string
  z2_source_name?: string
  now_playing?: NowPlaying
  play_state?: string  // 'play' | 'pause' | 'stop' from HEOS
  stream_quality?: string
}

export interface SourceEntry {
  id: string
  name: string
  /** Name without the UI rename (env config > receiver > built-in). */
  default_name?: string
}

export interface SurroundCategory {
  code: string     // OPSMLALL category: MOV, MUS, GAM, PUR
  label: string
  command: string  // MS<command> cycles the category
}

export interface UiEffects {
  ambient_background: boolean
  seasonal_effects: string
  shortcut_overlay: boolean
  card_animations: boolean
  ambient_intensity: number
}

export interface TimeSettings {
  timezone: string
  time_format: 'auto' | '24h' | '12h'
}

export interface RadioFavorite {
  mid: string
  name: string
  image_url?: string
  station?: string
}

export type NightModeKind = 'offset' | 'absolute'

export interface NightModeChannelConfig {
  channel: string
  mode: NightModeKind
  value: number
}

export interface NightModeSchedule {
  enabled: boolean
  days: string[]
  start: string
  end: string
  timezone: string
}

// Mirrors backend NightModeConfigRequest (also the /device.night_mode_config shape).
export interface NightModeConfig {
  mode: NightModeKind
  channels: NightModeChannelConfig[]
  schedule: NightModeSchedule
}

// Mirrors backend DeviceInfoResponse — GET /api/v1/device.
export interface DeviceInfo {
  device_name?: string
  zone1_name?: string
  zone2_name?: string
  sources?: SourceEntry[]
  source_name_map?: Record<string, string>
  source_name_overrides?: Record<string, string>
  channel_volumes?: Record<string, number>
  channel_names?: Record<string, string>
  receiver_ip?: string | null
  theme?: string
  ui_effects?: UiEffects
  time_settings?: TimeSettings
  night_mode_config?: NightModeConfig
  radio_favorites?: RadioFavorite[]
  /** Inputs the HEOS transport controls drive. */
  media_sources?: string[]
  surround_categories?: SurroundCategory[]
  /** Fallback mode list for receivers without OPSMLALL. */
  surround_modes?: string[]
}

export interface ApiResponse {
  ok: boolean
  status: number
  error?: string
  [key: string]: unknown
}

export type PostFn = (path: string, body?: object) => Promise<ApiResponse>

export type DeleteFn = (path: string) => Promise<ApiResponse>

export type GetFn = <T = unknown>(path: string) => Promise<ApiResponse & { data?: T }>

export type SendCommandFn = (command: string) => void

export interface SoundModeEntry {
  speakers: string
  description: string
  bestFor: string
  notes?: string
}
