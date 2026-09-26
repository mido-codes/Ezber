import type {
  AudioFileRow,
  AyahRow,
  ContentFileEntry,
  ContentIndex,
  LicenseEntry,
  ReciterRow,
  SegmentRow,
  SurahRow,
  WordRow,
} from './types'

/**
 * Normaliser for the grouped, lazily loaded content layout. The pipeline export
 * writes:
 *
 *   /content/index.json                        small boot index
 *   /content/surahs/<id>.json                  one surah's ayahs + words
 *   /content/segments/<reciter>/<surah>.json   word timings for one reciter/surah
 *
 * The normaliser stays tolerant of field aliases and of the columnar
 * `{columns, rows}` documents an exporter may emit. See web/CONTENT_BUNDLE.md.
 */

type Json = unknown

export class HttpError extends Error {
  readonly status: number

  constructor(url: string, status: number) {
    super(`${url}: HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export function resolveTemplate(template: string, values: Record<string, number | string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

function asRecord(value: Json): Record<string, Json> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null
}

export function str(value: Json, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

export function num(value: Json, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
}

export function nullableNum(value: Json): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = num(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

export function bool01(value: Json, fallback: 0 | 1 = 0): 0 | 1 {
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

/** Decode a columnar `{columns, rows}` table into objects. */
export function decodeTable(value: Json): Json[] | null {
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
    for (const key of ['reciter_id', 'variant', 'surah_id']) {
      if (record[key] !== undefined && decoded[key] === undefined) decoded[key] = record[key]
    }
    return decoded
  })
}

export function documentRows(value: Json, keys: string[]): Json[] {
  const decoded = decodeTable(value)
  if (decoded) return decoded
  const record = asRecord(value)
  if (!record) return []
  for (const key of keys) {
    const candidate = record[key]
    if (candidate === undefined) continue
    const nested = decodeTable(candidate)
    if (nested) return nested
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

// ---------------------------------------------------------------- index

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

export function normalizeLicenses(raw: Json[]): LicenseEntry[] {
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
    else if (Array.isArray(evidence) && evidence.length > 0) normalized.evidence_url = str(evidence[0])
    if (record.notice) normalized.notice = str(record.notice)
    if (record.attribution) normalized.attribution = str(record.attribution)
    entries.push(normalized)
  }
  return entries
}

function normaliseAttributions(raw: Json[]): string[] {
  const lines: string[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    const text = record ? str(record.text ?? record.attribution) : str(entry)
    if (text) lines.push(text)
  }
  return lines
}

function pathTemplate(record: Record<string, Json>, key: string): string | undefined {
  const paths = asRecord(record.paths)
  const candidate = record[key] ?? paths?.[key]
  return typeof candidate === 'string' && candidate ? candidate : undefined
}

function normalizeFileEntries(raw: Json): ContentFileEntry[] {
  const entries: ContentFileEntry[] = []
  for (const entry of Array.isArray(raw) ? raw : []) {
    const record = asRecord(entry)
    if (!record) continue
    const path = str(record.path ?? record.url ?? record.file)
    if (!path) continue
    const normalized: ContentFileEntry = { path, kind: str(record.kind, inferKindFromPath(path)) }
    if (record.sha256) normalized.sha256 = str(record.sha256)
    if (record.bytes !== undefined) normalized.bytes = num(record.bytes)
    if (record.rows !== undefined) normalized.rows = num(record.rows)
    if (record.reciter_id !== undefined) normalized.reciter_id = num(record.reciter_id)
    if (record.surah_id !== undefined) normalized.surah_id = num(record.surah_id)
    if (record.variant !== undefined) normalized.variant = str(record.variant)
    entries.push(normalized)
  }
  return entries
}

function inferKindFromPath(path: string): string {
  if (path.startsWith('segments/')) return 'segments'
  const base = path.split('/').pop() ?? path
  const name = base.replace(/\.json$/i, '').replace(/[-_]/g, '_')
  if (name === 'audio_files' || name === 'audiofiles') return 'audio_files'
  return name
}

/** Build a fetch template from the first inventory entry of a kind. */
function templateFromFiles(files: ContentFileEntry[], kind: string): string | undefined {
  const entry = files.find((file) => file.kind === kind)
  if (!entry) return undefined
  const parts = entry.path.split('/')
  if (kind === 'segments') {
    if (parts.length < 3) return undefined
    return [...parts.slice(0, -2), '{reciter_id}', '{surah_id}.json'].join('/')
  }
  if (!/\.json$/i.test(parts[parts.length - 1] ?? '')) return undefined
  return [...parts.slice(0, -1), '{surah_id}.json'].join('/')
}

/**
 * Returns the grouped boot index, or null when the document is not in the
 * grouped layout (for example the legacy bulk export). `surahs` and `reciters`
 * may be columnar `{columns, rows}` tables, exactly as the exporter writes
 * them.
 */
export function normalizeIndex(raw: Json): ContentIndex | null {
  const record = asRecord(raw)
  if (!record) return null

  const surahs = documentRows(record.surahs, ['surahs', 'chapters'])
    .map(normalizeSurah)
    .sort((a, b) => a.id - b.id)
  const reciters = documentRows(record.reciters, ['reciters'])
    .map(normalizeReciter)
    .sort((a, b) => a.id - b.id)
  if (surahs.length === 0 || reciters.length === 0) return null

  const countsRaw = asRecord(record.counts) ?? {}
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(countsRaw)) {
    if (typeof value === 'number') counts[key] = value
  }

  const licensesRaw = Array.isArray(record.licenses)
    ? (record.licenses as Json[])
    : asRecord(record.licenses)?.licenses
      ? ((asRecord(record.licenses)?.licenses as Json[]) ?? [])
      : []
  const attributionRaw = Array.isArray(record.attribution)
    ? (record.attribution as Json[])
    : asRecord(record.attribution)?.attributions
      ? ((asRecord(record.attribution)?.attributions as Json[]) ?? [])
      : []

  const files = normalizeFileEntries(record.files ?? record.parts ?? record.tables)
  const generatedBy = asRecord(record.generated_by)
  const webBundleVersion = num(record.web_bundle_version, 2)
  const layout = record.layout
    ? str(record.layout)
    : webBundleVersion >= 2
      ? 'grouped'
      : 'flat'
  const bundleId =
    str(record.bundle_id ?? record.bundle_digest ?? record.digest ?? record.logical_digest) ||
    `ezber-content-web:${webBundleVersion}:${JSON.stringify(counts)}`

  return {
    schema: str(record.schema, `ezber-content-web/${webBundleVersion}`),
    schema_version: num(record.schema_version, 1),
    web_bundle_version: webBundleVersion,
    layout,
    pipeline_version:
      record.pipeline_version !== undefined
        ? str(record.pipeline_version)
        : generatedBy?.pipeline_version !== undefined
          ? str(generatedBy.pipeline_version)
          : undefined,
    content_mode: record.content_mode ? str(record.content_mode) : undefined,
    bundle_id: bundleId,
    counts,
    surahs,
    reciters,
    licenses: normalizeLicenses(licensesRaw),
    attribution: normaliseAttributions(attributionRaw),
    files,
    surah_path:
      pathTemplate(record, 'surah_path') ??
      templateFromFiles(files, 'surah') ??
      'surahs/{surah_id}.json',
    segments_path:
      pathTemplate(record, 'segments_path') ??
      templateFromFiles(files, 'segments') ??
      'segments/{reciter_id}/{surah_id}.json',
    audio_path:
      record.audio_path !== undefined
        ? str(record.audio_path)
        : files.find((file) => file.kind === 'audio_files')?.path,
    licenses_path:
      record.licenses_file !== undefined
        ? str(record.licenses_file)
        : files.find((file) => file.kind === 'licenses')?.path,
    audio_files: Array.isArray(record.audio_files)
      ? (record.audio_files as Json[])
          .map((entry, index) => normalizeAudioFile(entry, index, new Set()))
          .filter((file): file is AudioFileRow => file !== null)
      : [],
  }
}

// ---------------------------------------------------------------- surahs

function normalizeWord(raw: Json, ayahId: number, position: number): WordRow {
  if (typeof raw === 'string') {
    return { ayah_id: ayahId, position, text_uthmani: null, transliteration: raw }
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

export interface SurahDocument {
  surah: SurahRow
  ayahs: AyahRow[]
  words: WordRow[]
}

/**
 * Normalise a per-surah document. The real export carries columnar `ayahs`,
 * `transliteration_rows` and `words` tables:
 *   { surah_id, ayahs: {columns, rows}, transliteration_rows: {…}, words: {…} }
 * Inline ayah `words` arrays, a bare ayah array and columnar ayahs are all
 * accepted too.
 */
export function normalizeSurahDocument(
  raw: Json,
  surah: SurahRow,
  resolveAyahId: (surahId: number, ayah: number) => number,
): SurahDocument {
  const record = asRecord(raw)
  const surahId = record ? num(record.surah_id ?? record.surah, surah.id) : surah.id
  const rawAyahs = documentRows(raw, ['ayahs', 'verses']) as Json[]

  // Top-level word and transliteration tables (the grouped export's shape).
  const tableWords = documentRows(record?.words, ['words']).map((word, index) =>
    normalizeWord(word, 0, index + 1),
  )
  const wordTablesPresent = tableWords.length > 0
  const transliterationById = new Map<number, string>()
  for (const row of documentRows(record?.transliteration_rows, ['transliteration_rows', 'rows'])) {
    const entry = asRecord(row)
    if (!entry) continue
    const ayahId = nullableNum(entry.ayah_id)
    const text = str(entry.text ?? entry.transliteration)
    if (ayahId !== null && text) transliterationById.set(ayahId, text)
  }

  const ayahs: AyahRow[] = []
  const words: WordRow[] = []

  for (const entry of rawAyahs) {
    const item = asRecord(entry) ?? {}
    const ayahNumber = num(item.ayah ?? item.number ?? item.verse_number, 0)
    if (ayahNumber <= 0) continue
    const ayahId = num(item.id ?? item.ayah_id, resolveAyahId(surahId, ayahNumber))

    const inlineWords = documentRows(item.words ?? item.word_transliterations, []).map(
      (word, index) => normalizeWord(word, ayahId, index + 1),
    )
    words.push(...inlineWords)
    const translation = str(item.transliteration ?? item.translit)
    const transliteration =
      translation || transliterationById.get(ayahId) || inlineWords.map((w) => w.transliteration).join(' ')
    ayahs.push({
      id: ayahId,
      surah_id: surahId,
      ayah: ayahNumber,
      verse_key: str(item.verse_key ?? item.key, `${surahId}:${ayahNumber}`),
      text_uthmani: str(item.text_uthmani ?? item.arabic ?? item.text),
      juz: nullableNum(item.juz),
      hizb: nullableNum(item.hizb),
      page: nullableNum(item.page),
      sajdah: bool01(item.sajdah),
      sajdah_type: item.sajdah_type ? str(item.sajdah_type) : null,
      transliteration,
    })
  }

  // Re-key the top-level words onto their ayah now that ids are resolved.
  if (wordTablesPresent) {
    const ayahIds = new Set(ayahs.map((ayah) => ayah.id))
    for (const word of tableWords) {
      if (word.ayah_id && ayahIds.has(word.ayah_id)) words.push(word)
    }
  }

  const uniqueWords = new Map<string, WordRow>()
  for (const word of words) uniqueWords.set(`${word.ayah_id}:${word.position}`, word)

  return { surah, ayahs, words: [...uniqueWords.values()] }
}

// --------------------------------------------------------------- segments

export interface SegmentsDocument {
  variant: string
  segments: SegmentRow[]
}

function normalizeSegmentRange(raw: Json): { word_index: number; start_ms: number; end_ms: number } | null {
  const record = asRecord(raw)
  if (!record) return null
  const start = num(record.start_ms ?? record.start, -1)
  const end = num(record.end_ms ?? record.end, -1)
  if (start < 0 || end <= start) return null
  return {
    word_index: num(record.word_index ?? record.index ?? record.word, 0),
    start_ms: start,
    end_ms: end,
  }
}

/**
 * Normalise a per-reciter/per-surah timing document. Accepted shapes:
 *   { reciter_id, variant, ayahs: [{ verse_key, segments: [{word_index,start_ms,end_ms}] }] }
 *   { reciter_id, variant, segments: [{ ayah_id|verse_key, word_index, start_ms, end_ms }] }
 *   legacy columnar {columns, rows}
 */
export function normalizeSegmentsDocument(
  raw: Json,
  options: {
    reciterId: number
    surahId: number
    ayahIdByVerseKey: (key: string) => number | undefined
    resolveAyahId: (surahId: number, ayah: number) => number
  },
): SegmentsDocument {
  const record = asRecord(raw) ?? {}
  const reciterId = num(record.reciter_id, options.reciterId)
  const variant = str(record.variant ?? record.style ?? record.style_id, 'default')
  const segments: SegmentRow[] = []

  const pushRow = (ayahId: number | undefined, range: { word_index: number; start_ms: number; end_ms: number }) => {
    if (!ayahId) return
    segments.push({
      reciter_id: reciterId,
      variant,
      ayah_id: ayahId,
      word_index: range.word_index,
      start_ms: range.start_ms,
      end_ms: range.end_ms,
      surah_id: options.surahId,
    })
  }

  // Grouped by ayah.
  const groups = documentRows(record.ayahs ?? record.timings, ['ayahs', 'timings'])
  for (const entry of groups) {
    if (typeof entry === 'string' || typeof entry === 'number') continue
    const group = asRecord(entry)
    if (!group) continue
    const verseKey = group.verse_key ? str(group.verse_key) : group.key ? str(group.key) : ''
    const ayahNumber = num(group.ayah ?? group.number, 0)
    const ayahId =
      nullableNum(group.ayah_id) ??
      (verseKey ? options.ayahIdByVerseKey(verseKey) : undefined) ??
      (ayahNumber > 0 ? options.resolveAyahId(options.surahId, ayahNumber) : undefined)
    const ranges = documentRows(group.segments ?? group.words, ['segments', 'words'])
    for (const range of ranges) {
      const normalized = normalizeSegmentRange(range)
      if (normalized) pushRow(ayahId ?? undefined, normalized)
    }
  }

  // Flat rows.
  if (groups.length === 0) {
    const flat = decodeTable(raw) ?? documentRows(record.segments, ['segments', 'rows', 'timings'])
    for (const entry of flat) {
      const row = asRecord(entry)
      if (!row) continue
      const ayahId =
        nullableNum(row.ayah_id) ??
        (row.verse_key ? options.ayahIdByVerseKey(str(row.verse_key)) : undefined) ??
        (num(row.ayah ?? row.number, 0) > 0
          ? options.resolveAyahId(options.surahId, num(row.ayah ?? row.number))
          : undefined)
      const range = normalizeSegmentRange(row)
      if (range) pushRow(ayahId ?? undefined, range)
    }
  }

  segments.sort(
    (a, b) => a.ayah_id - b.ayah_id || a.word_index - b.word_index || a.start_ms - b.start_ms,
  )
  return { variant, segments }
}

// ----------------------------------------------------------------- audio

export function normalizeAudioFile(raw: Json, index: number, reciterIds: Set<number>): AudioFileRow | null {
  const record = asRecord(raw) ?? {}
  const kindRaw = str(record.kind, record.ayah ? 'ayah' : 'chapter').toLowerCase()
  const kind: 'ayah' | 'chapter' = kindRaw === 'ayah' ? 'ayah' : 'chapter'
  const reciterId = num(record.reciter_id ?? record.reciterId, 0)
  if (reciterId && reciterIds.size > 0 && !reciterIds.has(reciterId)) return null
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

// ------------------------------------------------------------------ fetch

export interface FetchJsonOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  /** Abort a stalled request after this many milliseconds. */
  timeoutMs?: number
  onProgress?: (bytes: number, totalBytes?: number) => void
}

/**
 * Fetch and parse JSON, optionally reporting download progress. Uses a timeout
 * so a stalled request can never freeze a view.
 */
export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<Json> {
  const fetchImpl = options.fetchImpl ?? fetch
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let signal = options.signal
  if (!signal && typeof AbortController !== 'undefined') {
    controller = new AbortController()
    timer = setTimeout(() => controller?.abort(), options.timeoutMs ?? 15000)
    // Never keep a test or a page alive just for the timeout.
    ;(timer as unknown as { unref?: () => void }).unref?.()
    signal = controller.signal
  }
  try {
    const response = await fetchImpl(url, { cache: 'no-cache', signal })
    if (!response.ok) throw new HttpError(url, response.status)
    const totalBytes = Number(response.headers.get('content-length')) || undefined
    const body = response.body
    if (!body || !options.onProgress) {
      return (await response.json()) as Json
    }
    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        bytes += value.byteLength
        options.onProgress(bytes, totalBytes)
      }
    }
    const merged = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder().decode(merged)) as Json
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const trimmedBase = base.endsWith('/') ? base : `${base}/`
  return `${trimmedBase}${path.replace(/^\//, '')}`
}
