/**
 * User records mirror schema/user_schema.sql one table per interface, with
 * snake_case field names and ISO-8601 UTC strings for dates.
 *
 * One documented extension is added for a feature the journey decisions fixed
 * but the shared schema does not carry yet: `presets.section_repeats`
 * (0 = loop the section until stopped, per Q5/A2). It is read and written like
 * a schema column and flagged in web/README.md until the canonical schema
 * grows the column.
 */

export type MemorizationState = 'learning' | 'review' | 'memorized'
export type DownloadScope = 'inherit' | 'surah' | 'preset'
export type PlaybackMode = 'ayah' | 'chapter'
export type Rating = 'solid' | 'shaky'

export interface PresetRow {
  id: string
  name: string
  surah_id: number
  from_ayah: number
  to_ayah: number
  repeat_count: number
  reciter_id: number
  transliteration_id: string | null
  translation_id: string | null
  show_arabic: 0 | 1
  show_transliteration: 0 | 1
  show_translation: 0 | 1
  pause_between_repeat_ms: number
  playback_mode: PlaybackMode
  download_scope: DownloadScope
  created_at: string
  updated_at: string | null
  last_used_at: string | null
  /** Extension: 0 = loop until stopped. */
  section_repeats: number
}

export interface PresetVerseRow {
  preset_id: string
  ayah: number
  repeat_count: number
}

export interface ProgressRow {
  preset_id: string
  ayah: number
  verse_key: string | null
  repetitions_done: number
  memorization_state: MemorizationState
  last_played_at: string | null
  next_review_at: string | null
}

export interface SessionRow {
  id?: number
  preset_id: string | null
  started_at: string
  ended_at: string | null
  verses_covered: number
  repetitions: number
  interrupted: 0 | 1
}

export interface PlanStateRow {
  preset_id: string
  plan_index: number
  position_ms: number
  repetition_counters_json: string | null
  updated_at: string | null
}

export interface NoteRow {
  id?: number
  verse_key: string
  body_md: string
  created_at: string
  updated_at: string | null
}

export interface SettingRow {
  key: string
  value: string
}

export interface RatingRow {
  id?: number
  verse_key: string
  rating: Rating
  created_at: string
}

export interface SchemaVersionRow {
  id: 'current'
  version: number
}

export interface UserExport {
  format: 'ezber-user/1'
  exported_at: string
  schema_version: number
  presets: PresetRow[]
  preset_verses: PresetVerseRow[]
  progress: ProgressRow[]
  sessions: SessionRow[]
  plan_state: PlanStateRow[]
  notes: NoteRow[]
  settings: SettingRow[]
  ratings: RatingRow[]
}

export const SETTING_DEFAULTS: Record<string, string> = {
  language: 'en',
  theme: 'system',
  'defaults.reciter_id': '',
  'defaults.show_arabic': '0',
  'defaults.show_transliteration': '1',
  'defaults.repeat_count': '5',
  'defaults.section_repeats': '1',
  'defaults.pause_between_repeat_ms': '500',
  'downloads.scope': 'surah',
  'audio.navigation': 'duck',
  'audio.calls': 'pauseAndResume',
  'ui.last_preset_id': '',
  'onboarding.completed': '0',
  'placeholder.seeded': '0',
}
