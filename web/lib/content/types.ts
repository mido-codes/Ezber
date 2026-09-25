/**
 * Content records mirror schema/content_schema.sql one table per interface.
 * Field names stay snake_case so every persisted record maps 1:1 to the
 * canonical SQLite schema; the content pipeline web export is normalised into
 * these shapes before it is written to IndexedDB.
 */

export interface ContentMetaRow {
  key: string
  value: string
}

export interface SurahRow {
  id: number
  name_arabic: string
  name_latin: string
  name_english: string
  verses_count: number
  revelation: 'Meccan' | 'Medinan'
  bismillah_pre: 0 | 1
  revelation_order?: number | null
  rukus?: number | null
}

export interface WordRow {
  id?: number
  ayah_id: number
  position: number
  text_uthmani: string | null
  transliteration: string
  translation?: string | null
}

export interface AyahRow {
  id: number
  surah_id: number
  ayah: number
  verse_key: string
  text_uthmani: string
  juz?: number | null
  hizb?: number | null
  page?: number | null
  sajdah?: 0 | 1
  sajdah_type?: string | null
  transliteration: string
}

export interface ReciterRow {
  id: number
  remote_id: string
  name: string
  style: string | null
  qirat: string | null
  source: string
  license_id: string
  license_url: string
  license_evidence_url: string
  attribution: string
  has_segments: 0 | 1
  enabled: 0 | 1
}

export interface AudioFileRow {
  id: number
  reciter_id: number
  kind: 'ayah' | 'chapter'
  surah_id: number | null
  ayah: number | null
  chapter: number | null
  variant: string
  url: string
  local_path?: string | null
  bytes?: number | null
  bitrate?: number | null
  duration_ms?: number | null
  checksum?: string | null
  downloaded_at?: string | null
}

export interface SegmentRow {
  reciter_id: number
  variant: string
  ayah_id: number
  word_index: number
  start_ms: number
  end_ms: number
}

export interface TransliterationRow {
  transliteration_id: number
  ayah_id: number
  text: string
}

export interface TransliterationResourceRow {
  id: number
  resource_id: string
  name: string
  author?: string | null
  language: string
  source: string
  license_id: string
  license_url: string
  license_evidence_url: string
  attribution: string
}

export interface LicenseEntry {
  id: string
  name: string
  url?: string
  evidence_url?: string
  notice?: string
  attribution?: string
}

export interface ContentBundleManifest {
  schema: string
  schema_version: number
  pipeline_version?: string
  content_mode?: string
  bundle_id?: string
  counts?: Record<string, number>
  files?: Record<string, unknown>
  attribution?: string[]
  licenses?: LicenseEntry[]
  notes?: string[]
}

export interface NormalizedBundle {
  manifest: ContentBundleManifest
  surahs: SurahRow[]
  ayahs: AyahRow[]
  words: WordRow[]
  reciters: ReciterRow[]
  audio_files: AudioFileRow[]
  segments: SegmentRow[]
  transliterations: TransliterationResourceRow[]
  transliteration_rows: TransliterationRow[]
  licenses: LicenseEntry[]
  attribution: string[]
}

export interface WordSegment {
  word_index: number
  start_ms: number
  end_ms: number
}

export interface ContentSummary {
  mode: 'bundle' | 'placeholder'
  schema_version: number
  pipeline_version?: string
  bundle_id?: string
  counts: Record<string, number>
  licenses: LicenseEntry[]
  attribution: string[]
}
