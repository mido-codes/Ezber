import type {
  AudioFileRow,
  AyahRow,
  ContentBundleManifest,
  LicenseEntry,
  NormalizedBundle,
  ReciterRow,
  SegmentRow,
  SurahRow,
  TransliterationResourceRow,
  TransliterationRow,
  WordRow,
} from './types'

/**
 * Loader for the content pipeline's web export.
 *
 * The pipeline (task fm/ezber-content-web-export) writes a deterministic web
 * bundle under content-pipeline/build/web/. This loader accepts either a single
 * `bundle.json` with inline arrays or an `index.json` manifest that points at
 * per-table files, and normalises common field aliases into the canonical
 * schema shapes in ./types.ts. See web/CONTENT_BUNDLE.md for the contract.
 *
 * The bundle is discovered at /content/ by default. When nothing is installed
 * the app falls back to lib/content/placeholder.ts.
 */

export const CONTENT_BASE_URL = '/content/'

type Json = unknown

function asRecord(value: Json): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null
}

function decodeTable(value: Json): Json[] | null {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  if (!record) return null
  const columns = record.columns
  const rows = record.rows
  if (!Array.isArray(columns) || !Array.isArray(rows)) return null
  return rows.map((row) => {
    if (!Array.isArray(row)) return row
    const decoded: Record<string, Json> = {}
    columns.forEach((column, index) => {
      decoded[String(column)] = row[index] ?? null
    })
    // Segment files hoist reciter_id/variant into the document header.
    for (const key of ['reciter_id', 'variant']) {
      if (record[key] !== undefined && decoded[key] === undefined) decoded[key] = record[key]
    }
    return decoded
  })
}

function unwrapArray(value: Json, keys: string[]): Json[] {
  const decoded = decodeTable(value)
  if (decoded) return decoded
  const record = asRecord(value)
  if (!record) return []
  for (const key of keys) {
    const candidate = record[key]
    if (Array.isArray(candidate)) return candidate
    const nested = asRecord(candidate)
    if (nested) {
      for (const inner of ['data', 'items', 'rows', 'entries']) {
        if (Array.isArray(nested[inner])) return nested[inner] as Json[]
      }
    }
  }
  for (const inner of ['data', 'items', 'rows', 'entries']) {
    if (Array.isArray(record[inner])) return record[inner] as Json[]
  }
  return []
}

function str(value: Json, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

function num(value: Json, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

function nullableNum(value: Json): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = num(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function bool01(value: Json, fallback: 0 | 1 = 0): 0 | 1 {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value ? 1 : 0
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true' ? 1 : 0
  return fallback
}

/** Quran-wide ayah id from the cumulative surah verse counts. */
export function buildAyahIdResolver(surahs: SurahRow[]): (surahId: number, ayah: number) => number {
  const offsets = new Map<number, number>()
  let running = 0
  for (const surah of [...surahs].sort((a, b) => a.id - b.id)) {
    offsets.set(surah.id, running)
    running += surah.verses_count
  }
  return (surahId, ayah) => (offsets.get(surahId) ?? 0) + ayah
}

function normalizeSurah(raw: Json, index: number): SurahRow {
  const record = asRecord(raw) ?? {}
  const revelationRaw = str(record.revelation ?? record.revelation_place ?? record.place, 'Meccan')
  return {
    id: num(record.id ?? record.surah_id, index + 1),
    name_arabic: str(record.name_arabic ?? record.arabic ?? record.nameArabic),
    name_latin: str(record.name_latin ?? record.latin ?? record.nameLatin ?? record.name),
    name_english: str(record.name_english ?? record.english ?? record.nameEnglish ?? record.tname),
    verses_count: num(record.verses_count ?? record.verse_count ?? record.verses ?? record.ayahs_count, 0),
    revelation: revelationRaw.toLowerCase().startsWith('med') ? 'Medinan' : 'Meccan',
    bismillah_pre: bool01(record.bismillah_pre ?? record.bismillahPre, 0),
    revelation_order: nullableNum(record.revelation_order ?? record.order),
    rukus: nullableNum(record.rukus),
  }
}

function normalizeWord(raw: Json, ayahId: number, position: number): WordRow {
  if (typeof raw === 'string') {
    return {
      ayah_id: ayahId,
      position,
      text_uthmani: null,
      transliteration: raw,
    }
  }
  const record = asRecord(raw) ?? {}
  return {
    ayah_id: num(record.ayah_id, ayahId),
    position: num(record.position ?? record.index ?? record.word_index, position),
    text_uthmani: record.text_uthmani
      ? str(record.text_uthmani)
      : record.uthmani
        ? str(record.uthmani)
        : null,
    transliteration: str(record.transliteration ?? record.text ?? record.translit),
    translation: record.translation ? str(record.translation) : null,
  }
}

function normalizeAyah(
  raw: Json,
  resolveAyahId: (surahId: number, ayah: number) => number,
  words: WordRow[],
): AyahRow {
  const record = asRecord(raw) ?? {}
  const surahId = num(record.surah_id ?? record.surah ?? record.surahId, 0)
  const ayah = num(record.ayah ?? record.number ?? record.verse_number ?? record.ayah_number, 0)
  const verseKeyValue = str(record.verse_key ?? record.key, surahId && ayah ? `${surahId}:${ayah}` : '')
  const wordsForAyah = words
    .filter((word) => word.ayah_id === num(record.id, resolveAyahId(surahId, ayah)))
    .sort((a, b) => a.position - b.position)
  const transliteration =
    str(record.transliteration ?? record.translit) ||
    wordsForAyah.map((word) => word.transliteration).join(' ')
  return {
    id: num(record.id ?? record.ayah_id, resolveAyahId(surahId, ayah)),
    surah_id: surahId,
    ayah,
    verse_key: verseKeyValue || `${surahId}:${ayah}`,
    text_uthmani: str(record.text_uthmani ?? record.arabic ?? record.text),
    juz: nullableNum(record.juz),
    hizb: nullableNum(record.hizb),
    page: nullableNum(record.page),
    sajdah: bool01(record.sajdah),
    sajdah_type: record.sajdah_type ? str(record.sajdah_type) : null,
    transliteration,
  }
}

function normalizeReciter(raw: Json, index: number): ReciterRow {
  const record = asRecord(raw) ?? {}
  return {
    id: num(record.id ?? record.reciter_id, index + 1),
    remote_id: str(record.remote_id ?? record.resource_id ?? record.slug ?? record.id, `reciter-${index + 1}`),
    name: str(record.name, `Reciter ${index + 1}`),
    style: record.style ? str(record.style) : null,
    qirat: record.qirat ? str(record.qirat) : null,
    source: str(record.source, 'bundle'),
    license_id: str(record.license_id, 'unknown'),
    license_url: str(record.license_url),
    license_evidence_url: str(record.license_evidence_url),
    attribution: str(record.attribution),
    has_segments: bool01(record.has_segments ?? (record.segments ? 1 : 0)),
    enabled: bool01(record.enabled ?? 1, 1),
  }
}

function normalizeAudioFile(raw: Json, index: number, reciterIds: Set<number>): AudioFileRow | null {
  const record = asRecord(raw) ?? {}
  const kindRaw = str(record.kind, record.ayah ? 'ayah' : 'chapter').toLowerCase()
  const kind: 'ayah' | 'chapter' = kindRaw === 'ayah' ? 'ayah' : 'chapter'
  const reciterId = num(record.reciter_id ?? record.reciterId, 0)
  if (reciterId && !reciterIds.has(reciterId)) return null
  const surahId = nullableNum(record.surah_id ?? record.surah)
  const chapter = nullableNum(record.chapter)
  return {
    id: num(record.id, index + 1),
    reciter_id: reciterId,
    kind,
    surah_id: surahId ?? chapter,
    ayah: nullableNum(record.ayah ?? record.ayah_number),
    chapter: chapter ?? surahId,
    variant: str(record.variant ?? record.style_id ?? record.style, 'default'),
    url: str(record.url ?? record.audio_url ?? record.src),
    local_path: record.local_path ? str(record.local_path) : null,
    bytes: nullableNum(record.bytes ?? record.size),
    bitrate: nullableNum(record.bitrate),
    duration_ms: nullableNum(record.duration_ms ?? record.duration),
    checksum: record.checksum ? str(record.checksum) : record.sha1 ? str(record.sha1) : null,
    downloaded_at: record.downloaded_at ? str(record.downloaded_at) : null,
  }
}

function normalizeSegment(raw: Json): SegmentRow | null {
  const record = asRecord(raw) ?? {}
  const reciterId = num(record.reciter_id ?? record.reciterId, 0)
  const ayahId = num(record.ayah_id ?? record.ayahId, 0)
  if (!reciterId || !ayahId) return null
  return {
    reciter_id: reciterId,
    variant: str(record.variant ?? record.style_id ?? record.style, 'default'),
    ayah_id: ayahId,
    word_index: num(record.word_index ?? record.index ?? record.word, 0),
    start_ms: num(record.start_ms ?? record.start, 0),
    end_ms: num(record.end_ms ?? record.end, 0),
  }
}

function normalizeTransliterationResource(raw: Json, index: number): TransliterationResourceRow {
  const record = asRecord(raw) ?? {}
  return {
    id: num(record.id ?? record.transliteration_id, index + 1),
    resource_id: str(record.resource_id, `transliteration-${index + 1}`),
    name: str(record.name, 'Transliteration'),
    author: record.author ? str(record.author) : null,
    language: str(record.language, 'en'),
    source: str(record.source, 'bundle'),
    license_id: str(record.license_id, 'unknown'),
    license_url: str(record.license_url),
    license_evidence_url: str(record.license_evidence_url),
    attribution: str(record.attribution),
  }
}

function normalizeTransliterationRow(
  raw: Json,
  resolveAyahId: (surahId: number, ayah: number) => number,
): TransliterationRow | null {
  const record = asRecord(raw) ?? {}
  const explicitId = nullableNum(record.ayah_id)
  const surahId = nullableNum(record.surah_id ?? record.surah)
  const ayah = nullableNum(record.ayah ?? record.number ?? record.verse_number)
  const ayahId =
    explicitId ??
    (surahId !== null && ayah !== null ? resolveAyahId(surahId, ayah) : null)
  if (ayahId === null) return null
  const text = str(record.text ?? record.transliteration)
  if (!text) return null
  return {
    transliteration_id: num(record.transliteration_id, 1),
    ayah_id: ayahId,
    text,
  }
}

function normalizeLicenses(raw: Json[]): LicenseEntry[] {
  const entries: LicenseEntry[] = []
  for (const entry of raw) {
    const record = asRecord(entry) ?? {}
    const id = str(record.id ?? record.key ?? record.name)
    if (!id) continue
    const normalized: LicenseEntry = {
      id,
      name: str(record.name ?? record.title, id),
    }
    if (record.url) normalized.url = str(record.url)
    const evidence = record.evidence_url ?? record.evidence_urls
    if (typeof evidence === 'string') normalized.evidence_url = evidence
    else if (Array.isArray(evidence) && evidence.length > 0) {
      normalized.evidence_url = str(evidence[0])
    }
    if (record.notice) normalized.notice = str(record.notice)
    if (record.attribution) normalized.attribution = str(record.attribution)
    entries.push(normalized)
  }
  return entries
}

function flattenSurahGroups(raw: Json[]): Json[] {
  const flattened: Json[] = []
  for (const item of raw) {
    const record = asRecord(item)
    if (!record) continue
    const grouped = (record.ayahs ?? record.verses) as Json | undefined
    if (Array.isArray(grouped) && !record.verse_key && !record.ayah && !record.number) {
      const surahId = num(record.id ?? record.surah_id, 0)
      for (const ayah of grouped) {
        const ayahRecord = asRecord(ayah)
        if (ayahRecord && surahId) {
          if (ayahRecord.surah_id === undefined && ayahRecord.surah === undefined) {
            ayahRecord.surah_id = surahId
          }
        }
        flattened.push(ayah)
      }
    } else {
      flattened.push(item)
    }
  }
  return flattened
}

function firstPart(parts: Record<string, Json>, keys: string[]): Json {
  for (const key of keys) {
    if (parts[key] !== undefined) return parts[key]
  }
  return undefined
}

export function normalizeBundle(
  manifest: ContentBundleManifest,
  parts: Record<string, Json>,
): NormalizedBundle {
  const surahs = unwrapArray(firstPart(parts, ['surahs', 'chapters']), ['surahs', 'chapters']).map(
    normalizeSurah,
  )
  const resolveAyahId = buildAyahIdResolver(surahs)

  const words = unwrapArray(firstPart(parts, ['words', 'word_rows']), ['words', 'word_rows']).map(
    (raw, index) => {
      const record = asRecord(raw) ?? {}
      return normalizeWord(raw, num(record.ayah_id, 0), index + 1)
    },
  )

  const ayahParts = firstPart(parts, ['ayahs', 'verses', 'ayah_rows', 'chapters'])
  const ayahs = flattenSurahGroups(
    unwrapArray(ayahParts, ['ayahs', 'verses', 'ayah_rows', 'chapters']),
  ).map((raw) => normalizeAyah(raw, resolveAyahId, words))

  // Inline words that came with each ayah, when the bundle embeds them.
  const wordKeys = new Set(words.map((word) => `${word.ayah_id}:${word.position}`))
  for (const raw of unwrapArray(ayahParts, ['ayahs', 'verses', 'chapters'])) {
    const record = asRecord(raw) ?? {}
    const inline = record.words
    if (!Array.isArray(inline)) continue
    const surahId = num(record.surah_id ?? record.surah, 0)
    const ayahNumber = num(record.ayah ?? record.number, 0)
    const ayahId = num(record.id ?? record.ayah_id, resolveAyahId(surahId, ayahNumber))
    inline.forEach((word, index) => {
      const normalized = normalizeWord(word, ayahId, index + 1)
      const key = `${normalized.ayah_id}:${normalized.position}`
      if (!wordKeys.has(key)) {
        wordKeys.add(key)
        words.push(normalized)
      }
    })
  }

  // Word tokens are the fallback when an ayah carries no transliteration line.
  const wordsByAyah = new Map<number, WordRow[]>()
  for (const word of words) {
    const list = wordsByAyah.get(word.ayah_id) ?? []
    list.push(word)
    wordsByAyah.set(word.ayah_id, list)
  }
  for (const ayah of ayahs) {
    if (!ayah.transliteration) {
      ayah.transliteration = (wordsByAyah.get(ayah.id) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((word) => word.transliteration)
        .join(' ')
    }
  }

  const reciters = unwrapArray(firstPart(parts, ['reciters']), ['reciters']).map(normalizeReciter)
  const reciterIds = new Set(reciters.map((reciter) => reciter.id))
  const audioFiles = unwrapArray(firstPart(parts, ['audio_files', 'audio']), [
    'audio_files',
    'audio',
  ])
    .map((raw, index) => normalizeAudioFile(raw, index, reciterIds))
    .filter((file): file is AudioFileRow => file !== null)

  const segments = unwrapArray(firstPart(parts, ['segments', 'timings']), ['segments', 'timings'])
    .map(normalizeSegment)
    .filter((segment): segment is SegmentRow => segment !== null)

  const transliterations = unwrapArray(firstPart(parts, ['transliterations', 'editions']), [
    'transliterations',
    'editions',
  ]).map(normalizeTransliterationResource)
  const transliterationRows = unwrapArray(
    firstPart(parts, ['transliteration_rows', 'rows']),
    ['transliteration_rows', 'rows'],
  )
    .map((raw) => normalizeTransliterationRow(raw, resolveAyahId))
    .filter((row): row is TransliterationRow => row !== null)

  // If no ayah-level transliteration was exported, join the rows in.
  if (transliterationRows.length > 0) {
    const byAyah = new Map(transliterationRows.map((row) => [row.ayah_id, row.text]))
    for (const ayah of ayahs) {
      if (!ayah.transliteration && byAyah.has(ayah.id)) {
        ayah.transliteration = byAyah.get(ayah.id) ?? ''
      }
    }
  }

  const licensePart = asRecord(firstPart(parts, ['licenses']))
  const attributionLines = [
    ...(manifest.attribution ?? []).map(String),
    ...unwrapArray(licensePart?.attributions, ['attributions'])
      .map((entry) => str(asRecord(entry)?.text))
      .filter(Boolean),
  ]

  return {
    manifest,
    surahs: surahs.sort((a, b) => a.id - b.id),
    ayahs: ayahs.sort((a, b) => a.id - b.id),
    words,
    reciters,
    audio_files: audioFiles,
    segments,
    transliterations,
    transliteration_rows: transliterationRows,
    licenses: normalizeLicenses(
      firstPart(parts, ['licenses']) !== undefined
        ? unwrapArray(firstPart(parts, ['licenses']), ['licenses'])
        : (manifest.licenses ?? []),
    ),
    attribution: attributionLines,
  }
}

function normalizeManifest(raw: Json): ContentBundleManifest {
  const record = asRecord(raw) ?? {}
  const generatedBy = asRecord(record.generated_by)
  const webBundleVersion = num(record.web_bundle_version, 0)
  const schema = webBundleVersion
    ? `ezber-content-web/${webBundleVersion}`
    : str(record.schema ?? record.format ?? 'ezber-content-web/1')
  const schemaVersion = num(record.schema_version ?? record.version, 1)
  const countsRaw = asRecord(record.counts) ?? {}
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(countsRaw)) {
    if (typeof value === 'number') counts[key] = value
  }
  const files = asRecord(record.files ?? record.parts ?? record.tables)
  const bundleId =
    str(
      record.bundle_id ??
        record.bundle_digest ??
        record.digest ??
        record.content_digest ??
        record.build_id ??
        record.logical_digest,
    ) || `${schema}:${schemaVersion}:${JSON.stringify(counts)}`
  const pipelineVersion =
    record.pipeline_version !== undefined
      ? str(record.pipeline_version)
      : generatedBy?.pipeline_version !== undefined
        ? str(generatedBy.pipeline_version)
        : undefined
  return {
    schema,
    schema_version: schemaVersion,
    pipeline_version: pipelineVersion,
    content_mode: record.content_mode ? str(record.content_mode) : undefined,
    bundle_id: bundleId,
    counts,
    files: files ?? (Array.isArray(record.files) ? { entries: record.files } : undefined),
    licenses: normalizeLicenses(
      Array.isArray(record.licenses) ? (record.licenses as Json[]) : [],
    ),
    attribution: Array.isArray(record.attribution) ? (record.attribution as string[]) : undefined,
    notes: Array.isArray(record.notes) ? (record.notes as string[]) : undefined,
  }
}

function filePaths(value: Json): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  const record = asRecord(value)
  if (!record) return []
  for (const key of ['path', 'url', 'file', 'src']) {
    if (typeof record[key] === 'string') return [record[key] as string]
  }
  for (const key of ['paths', 'files', 'parts', 'urls']) {
    const candidate = record[key]
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is string => typeof entry === 'string')
    }
  }
  return []
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const trimmedBase = base.endsWith('/') ? base : `${base}/`
  return `${trimmedBase}${path.replace(/^\//, '')}`
}

async function fetchJson(url: string): Promise<Json> {
  // Never let a stalled probe hold up the offline-first startup.
  const signal =
    typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
      ? AbortSignal.timeout(5000)
      : undefined
  const response = await fetch(url, { cache: 'no-cache', signal })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return (await response.json()) as Json
}

function inferKind(path: string): string {
  const base = path.split('/').pop() ?? path
  const name = base.replace(/\.json$/i, '').replace(/[-_]/g, '_')
  if (path.startsWith('segments/')) return 'segments'
  if (name === 'audio_files' || name === 'audiofiles') return 'audio_files'
  return name
}

function appendPart(parts: Record<string, Json>, kind: string, value: Json): void {
  if (Array.isArray(value)) {
    const existing = parts[kind]
    parts[kind] = Array.isArray(existing) ? [...existing, ...value] : value
    return
  }
  const decoded = decodeTable(value)
  if (decoded) {
    const existing = parts[kind]
    parts[kind] = Array.isArray(existing) ? [...existing, ...decoded] : decoded
    return
  }
  parts[kind] = value
}

async function loadFile(
  baseUrl: string,
  path: string,
  parts: Record<string, Json>,
  kindHint?: string,
): Promise<void> {
  if (/\.txt$/i.test(path)) return // verbatim notices are not tables
  const kind = kindHint ?? inferKind(path)
  if (kind === 'notice' || kind === 'translations') return
  const loaded = await fetchJson(joinUrl(baseUrl, path))
  appendPart(parts, kind, loaded)
}

const MANIFEST_CANDIDATES = ['index.json', 'manifest.json', 'bundle.json']

export interface FetchedBundle {
  manifest: ContentBundleManifest
  parts: Record<string, Json>
}

/**
 * Fetch the bundle from `baseUrl`. Returns null when no index/manifest exists
 * (the app then falls back to placeholder content).
 */
export async function fetchContentBundle(baseUrl = CONTENT_BASE_URL): Promise<FetchedBundle | null> {
  let manifestUrl: string | null = null
  let raw: Json = null
  for (const candidate of MANIFEST_CANDIDATES) {
    const url = joinUrl(baseUrl, candidate)
    try {
      raw = await fetchJson(url)
      manifestUrl = url
      break
    } catch {
      // Try the next candidate.
    }
  }
  if (!manifestUrl || raw === null) return null

  const manifest = normalizeManifest(raw)
  const parts: Record<string, Json> = {}
  const record = asRecord(raw) ?? {}

  // Inline tables (single-file bundle.json): any array- or column-table-valued
  // key is a table. Manifest bookkeeping keys are not tables.
  const MANIFEST_KEYS = new Set([
    'files',
    'parts',
    'tables',
    'counts',
    'meta',
    'generated_by',
    'database',
    'distribution_policy',
    'licenses_file',
  ])
  for (const [key, value] of Object.entries(record)) {
    if (MANIFEST_KEYS.has(key)) continue
    if (Array.isArray(value) || decodeTable(value)) parts[key] = value
  }

  const filesValue = record.files ?? record.parts ?? record.tables
  if (Array.isArray(filesValue)) {
    // Pipeline export: [{ path, kind, sha256, bytes, rows }, ...]
    for (const entry of filesValue) {
      const entryRecord = asRecord(entry)
      const path = entryRecord ? str(entryRecord.path) : ''
      if (!path) continue
      const kind = entryRecord?.kind ? str(entryRecord.kind) : undefined
      await loadFile(baseUrl, path, parts, kind)
    }
  } else {
    const files = asRecord(filesValue)
    for (const [name, value] of Object.entries(files ?? {})) {
      const paths = filePaths(value)
      for (const path of paths) {
        await loadFile(baseUrl, path, parts, name)
      }
    }
  }

  if (!parts.licenses && manifest.licenses) parts.licenses = manifest.licenses
  return { manifest, parts }
}
