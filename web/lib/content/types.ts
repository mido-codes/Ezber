/**
 * Content records mirror schema/content_schema.sql one table per interface.
 * Field names stay snake_case so every persisted record maps 1:1 to the
 * canonical SQLite schema; the grouped web export is normalised into these
 * shapes before it is cached.
 *
 * The web app is online-first and lazy: `/content/index.json` carries only the
 * small boot index (surah names + reciters + licence metadata), surah documents
 * are fetched per surah and word timings per reciter/surah. See
 * web/CONTENT_BUNDLE.md for the transport contract.
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
  /** Denormalised cache field: the surah the word belongs to. */
  surah_id?: number
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
  /** Denormalised from the ayah so segments can be cached per surah. */
  surah_id?: number
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

/** One entry from the index's `files` inventory. */
export interface ContentFileEntry {
  path: string
  kind: string
  sha256?: string
  bytes?: number
  rows?: number
  reciter_id?: number
  surah_id?: number
  variant?: string
}

/**
 * Normalised `/content/index.json`: the only thing loaded at boot. The real
 * export stores `surahs` and `reciters` as columnar `{columns, rows}` tables and
 * lists every payload in `files`.
 */
export interface ContentIndex {
  schema: string
  schema_version: number
  web_bundle_version: number
  layout: string
  pipeline_version?: string
  content_mode?: string
  bundle_id: string
  counts: Record<string, number>
  surahs: SurahRow[]
  reciters: ReciterRow[]
  licenses: LicenseEntry[]
  attribution: string[]
  /** Payload inventory from the export. */
  files: ContentFileEntry[]
  /** URL templates, derived from `surah_path`/`segments_path` or the inventory. */
  surah_path: string
  segments_path: string
  audio_path?: string
  /** `licenses_file` from the export, fetched lazily for the credits screen. */
  licenses_path?: string
  /** Small inline audio manifests when the export embeds them. */
  audio_files: AudioFileRow[]
}

export interface ContentSummary {
  mode: 'bundle' | 'placeholder'
  schema_version: number
  pipeline_version?: string
  bundle_id?: string
  /** Where the boot index came from. */
  source: 'network' | 'cache' | 'placeholder'
  counts: Record<string, number>
  licenses: LicenseEntry[]
  attribution: string[]
  surah_path?: string
  segments_path?: string
  cached_surahs: number
  cached_segment_sets: number
  /** Why the export could not be used, when it could not (never silent). */
  problem?: ContentProblem
}

/** A recorded reason an export could not be used, surfaced in the UI. */
export interface ContentProblem {
  kind: 'unsupported' | 'http' | 'network' | 'offline' | 'parse'
  message: string
  status?: number
}

export interface WordSegment {
  word_index: number
  start_ms: number
  end_ms: number
}

export interface SurahCacheRow {
  surah_id: number
  bundle_id: string
  rows: number
  cached_at: string
}

export interface SegmentsCacheRow {
  reciter_id: number
  surah_id: number
  bundle_id: string
  variant: string
  rows: number
  cached_at: string
}

export interface CacheStats {
  surahs: SurahCacheRow[]
  segment_sets: SegmentsCacheRow[]
  ayah_rows: number
  word_rows: number
  segment_rows: number
  audio_files: number
}

export interface ContentProgress {
  phase: 'index' | 'surah' | 'segments' | 'audio'
  message: string
  surah_id?: number
  reciter_id?: number
  bytes?: number
  total_bytes?: number
}
