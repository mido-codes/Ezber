import {
  clearStore,
  countRecords,
  deleteByIndex,
  getAllByIndex,
  getAllRecords,
  getFirstByIndex,
  getRecord,
  openDatabase,
  putRecord,
  putRecords,
  requestResult,
  runTransaction,
  type StoreSpec,
} from '../db/idb'
import {
  buildAyahIdResolver,
  documentRows,
  fetchJson as fetchJsonDocument,
  HttpError,
  joinUrl,
  normalizeAudioFile,
  normalizeIndex,
  normalizeLicenses,
  normalizeSegmentsDocument,
  normalizeSurahDocument,
  resolveTemplate,
} from './bundle'
import {
  placeholderAyahsFor,
  placeholderReciters,
  placeholderSegments,
  placeholderSurahs,
  placeholderSummary,
  placeholderWords,
} from './placeholder'
import type {
  AudioFileRow,
  AyahRow,
  CacheStats,
  ContentFileEntry,
  ContentIndex,
  ContentMetaRow,
  ContentProblem,
  ContentProgress,
  ContentSummary,
  LicenseEntry,
  ReciterRow,
  SegmentRow,
  SegmentsCacheRow,
  SurahCacheRow,
  SurahRow,
  WordRow,
} from './types'

export const CONTENT_DB_NAME = 'ezber-content'
export const CONTENT_DB_VERSION = 2

const CONTENT_STORES: StoreSpec[] = [
  { name: 'content_meta', keyPath: 'key' },
  { name: 'surahs', keyPath: 'id' },
  { name: 'reciters', keyPath: 'id' },
  { name: 'licenses', keyPath: 'id' },
  {
    name: 'ayahs',
    keyPath: 'id',
    indexes: [
      { name: 'verse_key', keyPath: 'verse_key', unique: true },
      { name: 'surah_id', keyPath: 'surah_id' },
    ],
  },
  {
    name: 'words',
    keyPath: ['ayah_id', 'position'],
    indexes: [
      { name: 'ayah_id', keyPath: 'ayah_id' },
      { name: 'surah_id', keyPath: 'surah_id' },
    ],
  },
  {
    name: 'segments',
    keyPath: ['reciter_id', 'variant', 'ayah_id', 'word_index'],
    recreate: true,
    indexes: [
      { name: 'ayah_id', keyPath: 'ayah_id' },
      { name: 'reciter_id', keyPath: 'reciter_id' },
      { name: 'reciter_surah', keyPath: ['reciter_id', 'surah_id'] },
    ],
  },
  {
    name: 'audio_files',
    keyPath: 'id',
    indexes: [
      { name: 'reciter_id', keyPath: 'reciter_id' },
      { name: 'surah_id', keyPath: 'surah_id' },
    ],
  },
  { name: 'surah_cache', keyPath: 'surah_id' },
  { name: 'segments_cache', keyPath: ['reciter_id', 'surah_id'] },
  // The v1 bulk-import tables are retired; content is now cached per surah.
  { name: 'transliterations', obsolete: true },
  { name: 'transliteration_rows', obsolete: true },
  { name: 'translations', obsolete: true },
  { name: 'translation_rows', obsolete: true },
]

/** v1 imported the whole bundle up front; drop that data on upgrade. */
function migrate(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number): void {
  if (oldVersion >= 2) return
  for (const store of ['ayahs', 'words', 'audio_files', 'content_meta', 'licenses', 'surahs', 'reciters']) {
    if (db.objectStoreNames.contains(store)) transaction.objectStore(store).clear()
  }
}

export interface OpenContentOptions {
  /** Base URL of the content export, usually `/content/`. */
  baseUrl?: string
  /** Skip the network probe and use the cached index or placeholder content. */
  offline?: boolean
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch
  /** Override the IndexedDB name (tests use isolated databases). */
  databaseName?: string
  onProgress?: (progress: ContentProgress) => void
}

function segmentsKey(reciterId: number, surahId: number): string {
  return `${reciterId}:${surahId}`
}

export class ContentRepository {
  static async open(options: OpenContentOptions = {}): Promise<ContentRepository> {
    const db = await openDatabase(
      options.databaseName ?? CONTENT_DB_NAME,
      CONTENT_DB_VERSION,
      CONTENT_STORES,
      migrate,
    )
    const repository = new ContentRepository(db, options)
    await repository.loadIndex()
    await repository.refreshCacheCounts()
    return repository
  }

  private readonly db: IDBDatabase
  private readonly baseUrl: string
  private readonly offline: boolean
  private readonly fetchImpl: typeof fetch | undefined
  private readonly onProgress: ((progress: ContentProgress) => void) | undefined

  private index: ContentIndex | null = null
  private source: 'network' | 'cache' | 'placeholder' = 'placeholder'
  private problem: ContentProblem | undefined
  private licensesMemory: LicenseEntry[] | null = null
  private attributionLines: string[] | null = null
  private cachedSurahs = 0
  private cachedSegmentSets = 0
  private readonly placeholderSurahIds = new Set<number>()

  private readonly ayahMemory = new Map<number, AyahRow[]>()
  private readonly wordsMemory = new Map<number, WordRow[]>()
  private readonly segmentMemory = new Map<string, SegmentRow[]>()
  private readonly audioMemory = new Map<string, AudioFileRow[]>()
  private audioGlobal: AudioFileRow[] | null = null

  private constructor(db: IDBDatabase, options: OpenContentOptions) {
    this.db = db
    this.baseUrl = options.baseUrl ?? '/content/'
    this.offline = options.offline ?? false
    this.fetchImpl = options.fetchImpl
    this.onProgress = options.onProgress
  }

  // ------------------------------------------------------------------ index

  private emitProgress(progress: ContentProgress): void {
    this.onProgress?.(progress)
  }

  private async loadIndex(): Promise<void> {
    this.emitProgress({ phase: 'index', message: 'Loading content index…' })
    let index: ContentIndex | null = null
    let source: 'network' | 'cache' | 'placeholder' = 'placeholder'
    let problem: ContentProblem | undefined

    if (!this.offline && !this.isOffline()) {
      try {
        const raw = await this.fetchJson(joinUrl(this.baseUrl, 'index.json'), {
          phase: 'index',
          message: 'Downloading content index…',
        })
        index = normalizeIndex(raw)
        if (index) {
          source = 'network'
        } else {
          problem = {
            kind: 'unsupported',
            message:
              'The content index exists but is not in the grouped layout the app expects. No content was imported.',
          }
        }
      } catch (error) {
        if (error instanceof HttpError) {
          problem =
            error.status === 404
              ? {
                  kind: 'http',
                  status: 404,
                  message:
                    'No content export is installed yet (HTTP 404). Placeholder readings are shown.',
                }
              : {
                  kind: 'http',
                  status: error.status,
                  message: `The content index could not be loaded (HTTP ${error.status}).`,
                }
        } else if (error instanceof SyntaxError) {
          problem = {
            kind: 'parse',
            message: 'The content index could not be parsed as JSON. No content was imported.',
          }
        } else {
          problem = {
            kind: 'network',
            message: 'The content index could not be loaded (network error).',
          }
        }
      }
    } else if (!this.offline) {
      problem = { kind: 'offline', message: 'You are offline; using the cached content index.' }
    }

    if (!index) {
      const cached = await this.readCachedIndex()
      if (cached) {
        index = cached
        source = 'cache'
      } else if (!problem) {
        problem = {
          kind: this.isOffline() || this.offline ? 'offline' : 'network',
          message: 'No content export is available yet; placeholder readings are shown.',
        }
      }
    }

    // A cached index can keep the app usable, but an unusable export stays
    // visible: never let a contract break hide behind placeholder content.
    if (index && problem?.kind === 'network' && source === 'cache') {
      problem = undefined
    }
    this.problem = problem

    if (index) {
      this.index = index
      this.source = source
      if (source === 'network') {
        // F12: skip the catalogue rewrite when nothing changed; F11: a new
        // bundle invalidates every cached reading and timing set.
        const previousBundle = await this.cachedBundleId()
        if (previousBundle !== index.bundle_id) {
          if (previousBundle !== null) await this.purgeStaleContentCaches()
          await this.writeIndexToCache(index)
        }
      }
    } else {
      this.index = null
      this.source = 'placeholder'
    }
  }

  private async cachedBundleId(): Promise<string | null> {
    const row = await getRecord<ContentMetaRow>(this.db, 'content_meta', 'bundle_id')
    if (!row) return null
    const mode = await getRecord<ContentMetaRow>(this.db, 'content_meta', 'mode')
    return mode?.value === 'bundle' ? row.value : null
  }

  /** F11: drop rows cached under an older bundle before importing a new one. */
  private async purgeStaleContentCaches(): Promise<void> {
    await this.clearContentCache()
    await clearStore(this.db, 'licenses')
    this.licensesMemory = null
    this.attributionLines = null
  }

  private async fetchJson(
    url: string,
    progress: Omit<ContentProgress, 'bytes' | 'total_bytes'>,
  ): Promise<unknown> {
    return fetchJsonDocument(url, {
      fetchImpl: this.fetchImpl,
      // The boot index should fail over to the cache quickly; content documents
      // get a little more room, then the view offers a retry.
      timeoutMs: progress.phase === 'index' ? 5000 : 10000,
      onProgress: (bytes, totalBytes) => {
        this.emitProgress({ ...progress, bytes, total_bytes: totalBytes })
      },
    })
  }

  /** True only when the browser positively reports no connection. */
  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }

  private async writeIndexToCache(index: ContentIndex): Promise<void> {
    const meta: ContentMetaRow[] = [
      { key: 'mode', value: 'bundle' },
      { key: 'bundle_id', value: index.bundle_id },
      { key: 'schema_version', value: String(index.schema_version) },
      { key: 'web_bundle_version', value: String(index.web_bundle_version) },
      { key: 'layout', value: index.layout },
      { key: 'counts', value: JSON.stringify(index.counts) },
      { key: 'attribution', value: JSON.stringify(index.attribution) },
      { key: 'files', value: JSON.stringify(index.files) },
      { key: 'surah_path', value: index.surah_path },
      { key: 'segments_path', value: index.segments_path },
      { key: 'index_cached_at', value: new Date().toISOString() },
    ]
    if (index.pipeline_version) meta.push({ key: 'pipeline_version', value: index.pipeline_version })
    if (index.content_mode) meta.push({ key: 'content_mode', value: index.content_mode })
    if (index.audio_path) meta.push({ key: 'audio_path', value: index.audio_path })
    if (index.licenses_path) meta.push({ key: 'licenses_path', value: index.licenses_path })

    await runTransaction(
      this.db,
      ['content_meta', 'surahs', 'reciters', 'licenses'],
      'readwrite',
      (stores) => {
        stores.content_meta.clear()
        stores.surahs.clear()
        stores.reciters.clear()
        for (const row of meta) stores.content_meta.put(row)
        for (const surah of index.surahs) stores.surahs.put(surah)
        for (const reciter of index.reciters) stores.reciters.put(reciter)
        // Licences are cached separately (lazily) so they survive index
        // refreshes; clearing them here would lose the credits document.
        for (const license of index.licenses) stores.licenses.put(license)
      },
    )
  }

  private async readCachedIndex(): Promise<ContentIndex | null> {
    const rows = await getAllRecords<ContentMetaRow>(this.db, 'content_meta')
    if (rows.length === 0) return null
    const map = new Map(rows.map((row) => [row.key, row.value]))
    if (map.get('mode') !== 'bundle') return null
    const [surahs, reciters, licenses] = await Promise.all([
      getAllRecords<SurahRow>(this.db, 'surahs'),
      getAllRecords<ReciterRow>(this.db, 'reciters'),
      getAllRecords<LicenseEntry>(this.db, 'licenses'),
    ])
    if (surahs.length === 0 || reciters.length === 0) return null
    const parse = <T,>(key: string, fallback: T): T => {
      const raw = map.get(key)
      if (raw === undefined) return fallback
      try {
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
    }
    return {
      schema: 'ezber-content-web/' + (map.get('web_bundle_version') ?? '2'),
      schema_version: parse('schema_version', 1),
      web_bundle_version: Number(map.get('web_bundle_version') ?? 2),
      layout: map.get('layout') ?? 'grouped',
      pipeline_version: map.get('pipeline_version'),
      content_mode: map.get('content_mode'),
      bundle_id: map.get('bundle_id') ?? 'cached',
      counts: parse('counts', {}),
      surahs: surahs.sort((a, b) => a.id - b.id),
      reciters: reciters.sort((a, b) => a.id - b.id),
      licenses,
      attribution: parse<string[]>('attribution', []),
      files: parse<ContentFileEntry[]>('files', []),
      surah_path: map.get('surah_path') ?? 'surahs/{surah_id}.json',
      segments_path: map.get('segments_path') ?? 'segments/{reciter_id}/{surah_id}.json',
      audio_path: map.get('audio_path'),
      licenses_path: map.get('licenses_path'),
      audio_files: [],
    }
  }

  private currentBundleId(): string {
    return this.index?.bundle_id ?? 'placeholder'
  }

  private resolveAyahId(surahId: number, ayah: number): number {
    return this.ayahIdResolver()(surahId, ayah)
  }

  private ayahIdResolver(): (surahId: number, ayah: number) => number {
    if (this.index) return buildAyahIdResolver(this.index.surahs)
    return buildAyahIdResolver(placeholderSurahs)
  }

  // ------------------------------------------------------------------ views

  summary(): ContentSummary {
    const index = this.index
    return {
      mode: index ? 'bundle' : 'placeholder',
      schema_version: index?.schema_version ?? placeholderSummary.schema_version,
      pipeline_version: index?.pipeline_version,
      bundle_id: index?.bundle_id,
      source: index ? this.source : 'placeholder',
      counts: index?.counts ?? placeholderSummary.counts,
      licenses: this.licensesMemory ?? (index ? index.licenses : placeholderSummary.licenses),
      attribution:
        this.attributionLines ?? (index ? index.attribution : placeholderSummary.attribution),
      surah_path: index?.surah_path,
      segments_path: index?.segments_path,
      cached_surahs: this.cachedSurahs,
      cached_segment_sets: this.cachedSegmentSets,
      problem: this.problem,
    }
  }

  private placeholderIndexMode(): boolean {
    return this.index === null
  }

  /** True when this surah's reading is the built-in placeholder. */
  isPlaceholderSurah(surahId: number): boolean {
    return this.placeholderIndexMode() || this.placeholderSurahIds.has(surahId)
  }

  async surahs(): Promise<SurahRow[]> {
    if (this.index) return this.index.surahs
    return placeholderSurahs
  }

  async surah(id: number): Promise<SurahRow | undefined> {
    if (this.index) return this.index.surahs.find((surah) => surah.id === id)
    return placeholderSurahs.find((surah) => surah.id === id)
  }

  async reciters(): Promise<ReciterRow[]> {
    if (this.index) return this.index.reciters
    return placeholderReciters
  }

  async reciter(id: number): Promise<ReciterRow | undefined> {
    if (this.index) return this.index.reciters.find((reciter) => reciter.id === id)
    return placeholderReciters.find((reciter) => reciter.id === id)
  }

  async licenses(): Promise<LicenseEntry[]> {
    if (!this.index) return placeholderSummary.licenses
    if (this.licensesMemory) return this.licensesMemory
    if (this.index.licenses.length > 0) {
      this.licensesMemory = this.index.licenses
      return this.licensesMemory
    }

    const cached = await getAllRecords<LicenseEntry>(this.db, 'licenses')
    if (cached.length > 0) {
      this.licensesMemory = cached
      return cached
    }

    if (this.index.licenses_path && !this.isOffline()) {
      try {
        const raw = await this.fetchJson(joinUrl(this.baseUrl, this.index.licenses_path), {
          phase: 'index',
          message: 'Downloading credits…',
        })
        const entries = normalizeLicenses(documentRows(raw, ['licenses']))
        const attributions = documentRows(raw, ['attributions'])
          .map((entry) => {
            const record = entry as { text?: string; attribution?: string }
            return record?.text ?? record?.attribution ?? ''
          })
          .filter(Boolean)
        if (entries.length > 0) {
          await putRecords(this.db, 'licenses', entries)
          this.licensesMemory = entries
          if (attributions.length > 0) this.attributionLines = attributions
          return entries
        }
      } catch {
        // Credits are non-blocking: an offline user keeps the cached copy.
      }
    }
    this.licensesMemory = cached
    return cached
  }

  // ---------------------------------------------------------------- surahs

  private storeSurahInMemory(surahId: number, ayahs: AyahRow[], words?: WordRow[]): void {
    this.ayahMemory.set(surahId, ayahs)
    const wordRows =
      words ??
      ayahs.flatMap((ayah) =>
        placeholderWords(ayah).map((word) => ({ ...word, surah_id: surahId })),
      )
    for (const word of wordRows) {
      const list = this.wordsMemory.get(word.ayah_id) ?? []
      list.push(word)
      this.wordsMemory.set(word.ayah_id, list)
    }
  }

  private async readCachedSurah(
    surahId: number,
  ): Promise<{ ayahs: AyahRow[]; words: WordRow[] } | null> {
    const cache = await getRecord<SurahCacheRow>(this.db, 'surah_cache', surahId)
    if (!cache || cache.bundle_id !== this.currentBundleId()) return null
    const ayahs = await getAllByIndex<AyahRow>(this.db, 'ayahs', 'surah_id', surahId)
    if (ayahs.length === 0) return null
    const words = await getAllByIndex<WordRow>(this.db, 'words', 'surah_id', surahId)
    return { ayahs: ayahs.sort((a, b) => a.ayah - b.ayah), words }
  }

  private async writeSurahCache(
    surahId: number,
    ayahs: AyahRow[],
    words: WordRow[],
  ): Promise<void> {
    const existing = await getRecord<SurahCacheRow>(this.db, 'surah_cache', surahId)
    const wordRows = words.map((word) => ({ ...word, surah_id: surahId }))
    await deleteByIndex(this.db, 'ayahs', 'surah_id', surahId).catch(() => {})
    await deleteByIndex(this.db, 'words', 'surah_id', surahId).catch(() => {})
    await runTransaction(this.db, ['ayahs', 'words', 'surah_cache'], 'readwrite', (stores) => {
      for (const ayah of ayahs) stores.ayahs.put(ayah)
      for (const word of wordRows) stores.words.put(word)
      stores.surah_cache.put({
        surah_id: surahId,
        bundle_id: this.currentBundleId(),
        rows: ayahs.length,
        cached_at: new Date().toISOString(),
      })
    })
    if (!existing) this.cachedSurahs += 1
  }

  /**
   * Load one surah's ayahs (and words). Hits the memory cache, then the
   * IndexedDB cache, then `/content/surahs/<id>.json`. A 404 falls back to the
   * built-in placeholder reading for that surah so a partial bundle stays
   * browsable.
   */
  async ayahs(surahId: number): Promise<AyahRow[]> {
    const memory = this.ayahMemory.get(surahId)
    if (memory) return memory

    if (!this.index) {
      const ayahs = placeholderAyahsFor(surahId)
      this.storeSurahInMemory(surahId, ayahs)
      return ayahs
    }

    const cached = await this.readCachedSurah(surahId)
    if (cached) {
      this.storeSurahInMemory(surahId, cached.ayahs, cached.words)
      return cached.ayahs
    }

    const surah = this.index.surahs.find((entry) => entry.id === surahId)
    if (!surah) {
      // Not in the catalogue (a partial bundle): keep the app browsable with
      // the built-in placeholder reading rather than an empty screen.
      const ayahs = placeholderAyahsFor(surahId)
      this.placeholderSurahIds.add(surahId)
      this.storeSurahInMemory(surahId, ayahs)
      return ayahs
    }
    if (this.isOffline()) throw new Error('offline')
    const path = resolveTemplate(this.index.surah_path, { surah_id: surahId })
    try {
      const raw = await this.fetchJson(joinUrl(this.baseUrl, path), {
        phase: 'surah',
        message: `Downloading ${surah.name_latin}…`,
        surah_id: surahId,
      })
      const document = normalizeSurahDocument(raw, surah, this.ayahIdResolver())
      await this.writeSurahCache(surahId, document.ayahs, document.words)
      this.storeSurahInMemory(surahId, document.ayahs, document.words)
      return document.ayahs
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        const ayahs = placeholderAyahsFor(surahId)
        this.placeholderSurahIds.add(surahId)
        this.storeSurahInMemory(surahId, ayahs)
        return ayahs
      }
      throw error
    }
  }

  async ayah(verseKey: string): Promise<AyahRow | undefined> {
    const [surahRaw, ayahRaw] = verseKey.split(':')
    const surahId = Number(surahRaw)
    const ayahNumber = Number(ayahRaw)
    if (!Number.isInteger(surahId) || !Number.isInteger(ayahNumber)) return undefined
    const ayahs = await this.ayahs(surahId)
    return ayahs.find((entry) => entry.ayah === ayahNumber)
  }

  async words(ayahId: number): Promise<WordRow[]> {
    const memory = this.wordsMemory.get(ayahId)
    if (memory) return [...memory].sort((a, b) => a.position - b.position)
    const rows = await getAllByIndex<WordRow>(this.db, 'words', 'ayah_id', ayahId)
    return rows.sort((a, b) => a.position - b.position)
  }

  // -------------------------------------------------------------- segments

  private async readCachedSegments(reciterId: number, surahId: number): Promise<SegmentRow[] | null> {
    const cache = await getRecord<SegmentsCacheRow>(this.db, 'segments_cache', [reciterId, surahId])
    if (!cache || cache.bundle_id !== this.currentBundleId()) return null
    const rows = await getAllByIndex<SegmentRow>(this.db, 'segments', 'reciter_surah', [
      reciterId,
      surahId,
    ])
    return rows
  }

  private async writeSegmentsCache(
    reciterId: number,
    surahId: number,
    variant: string,
    rows: SegmentRow[],
  ): Promise<void> {
    const existing = await getRecord<SegmentsCacheRow>(this.db, 'segments_cache', [
      reciterId,
      surahId,
    ])
    await deleteByIndex(this.db, 'segments', 'reciter_surah', [reciterId, surahId]).catch(() => {})
    await runTransaction(this.db, ['segments', 'segments_cache'], 'readwrite', (stores) => {
      for (const row of rows) stores.segments.put(row)
      stores.segments_cache.put({
        reciter_id: reciterId,
        surah_id: surahId,
        bundle_id: this.currentBundleId(),
        variant,
        rows: rows.length,
        cached_at: new Date().toISOString(),
      })
    })
    if (!existing) this.cachedSegmentSets += 1
  }

  /**
   * Load (and cache) one reciter's word timings for one surah. A 404 is a
   * normal condition — the reciter simply has no timings for that surah — and
   * is cached as an empty set so it is not re-fetched on every play.
   */
  async segmentsForSurah(reciterId: number, surahId: number): Promise<SegmentRow[]> {
    const key = segmentsKey(reciterId, surahId)
    const memory = this.segmentMemory.get(key)
    if (memory) return memory

    if (!this.index || this.placeholderSurahIds.has(surahId)) {
      const ayahs = await this.ayahs(surahId)
      const rows = ayahs.flatMap((ayah) => placeholderSegments(ayah, reciterId))
      this.segmentMemory.set(key, rows)
      return rows
    }

    const cached = await this.readCachedSegments(reciterId, surahId)
    if (cached) {
      this.segmentMemory.set(key, cached)
      return cached
    }

    if (this.isOffline()) throw new Error('offline')
    const path = resolveTemplate(this.index.segments_path, {
      reciter_id: reciterId,
      surah_id: surahId,
    })
    try {
      const raw = await this.fetchJson(joinUrl(this.baseUrl, path), {
        phase: 'segments',
        message: 'Downloading word timings…',
        surah_id: surahId,
        reciter_id: reciterId,
      })
      const document = normalizeSegmentsDocument(raw, {
        reciterId,
        surahId,
        ayahIdByVerseKey: (verseKey) => {
          const [surahRaw, ayahRaw] = verseKey.split(':')
          const surah = Number(surahRaw)
          const ayah = Number(ayahRaw)
          if (!Number.isInteger(surah) || !Number.isInteger(ayah)) return undefined
          return this.resolveAyahId(surah, ayah)
        },
        resolveAyahId: (surah, ayah) => this.resolveAyahId(surah, ayah),
      })
      await this.writeSegmentsCache(reciterId, surahId, document.variant, document.segments)
      this.segmentMemory.set(key, document.segments)
      return document.segments
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        await this.writeSegmentsCache(reciterId, surahId, 'default', [])
        this.segmentMemory.set(key, [])
        return []
      }
      throw error
    }
  }

  async segmentsForAyah(
    reciterId: number,
    ayah: AyahRow,
    variant?: string,
  ): Promise<SegmentRow[]> {
    const rows = await this.segmentsForSurah(reciterId, ayah.surah_id)
    return rows.filter(
      (row) => row.ayah_id === ayah.id && (variant === undefined || row.variant === variant),
    )
  }

  // ----------------------------------------------------------------- audio

  async audioFiles(reciterId: number, surahId?: number): Promise<AudioFileRow[]> {
    const key = `${reciterId}:${surahId ?? '*'}`
    const memory = this.audioMemory.get(key)
    if (memory) return memory

    if (this.index?.audio_files.length) {
      const rows = this.index.audio_files.filter(
        (file) => file.reciter_id === reciterId && (surahId === undefined || file.surah_id === surahId),
      )
      this.audioMemory.set(key, rows)
      return rows
    }

    if (!this.index?.audio_path) return []

    // The export's audio manifest is one global file; per-reciter/surah files
    // are templates with placeholders.
    if (!this.index.audio_path.includes('{')) {
      const all = await this.loadGlobalAudioFiles()
      const rows = all.filter(
        (file) => file.reciter_id === reciterId && (surahId === undefined || file.surah_id === surahId),
      )
      this.audioMemory.set(key, rows)
      return rows
    }

    if (surahId === undefined) return []
    const path = resolveTemplate(this.index.audio_path, {
      reciter_id: reciterId,
      surah_id: surahId,
    })
    try {
      const raw = await this.fetchJson(joinUrl(this.baseUrl, path), {
        phase: 'audio',
        message: 'Downloading audio manifest…',
        surah_id: surahId,
        reciter_id: reciterId,
      })
      const rows = documentRows(raw, ['audio_files', 'audio'])
        .map((entry, index) => normalizeAudioFile(entry, index, new Set([reciterId])))
        .filter((file): file is AudioFileRow => file !== null)
        .map((file) => (file.reciter_id === 0 ? { ...file, reciter_id: reciterId } : file))
      await this.writeAudioCache(reciterId, surahId, rows)
      this.audioMemory.set(key, rows)
      return rows
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) {
        this.audioMemory.set(key, [])
        return []
      }
      throw error
    }
  }

  private async loadGlobalAudioFiles(): Promise<AudioFileRow[]> {
    if (this.audioGlobal !== null) return this.audioGlobal
    let rows = await getAllRecords<AudioFileRow>(this.db, 'audio_files')
    if (rows.length === 0 && !this.isOffline() && this.index?.audio_path) {
      try {
        const raw = await this.fetchJson(joinUrl(this.baseUrl, this.index.audio_path), {
          phase: 'audio',
          message: 'Downloading audio manifest…',
        })
        rows = documentRows(raw, ['audio_files', 'audio'])
          .map((entry, index) => normalizeAudioFile(entry, index, new Set()))
          .filter((file): file is AudioFileRow => file !== null)
        if (rows.length > 0) {
          await runTransaction(this.db, ['audio_files'], 'readwrite', (stores) => {
            stores.audio_files.clear()
            for (const row of rows) stores.audio_files.put(row)
          })
        }
      } catch {
        rows = []
      }
    }
    this.audioGlobal = rows
    return rows
  }

  private async writeAudioCache(
    reciterId: number,
    surahId: number,
    rows: AudioFileRow[],
  ): Promise<void> {
    const existing = await getAllByIndex<AudioFileRow>(this.db, 'audio_files', 'surah_id', surahId)
    await runTransaction(this.db, ['audio_files'], 'readwrite', (stores) => {
      for (const row of existing) {
        if (row.reciter_id === reciterId) stores.audio_files.delete(row.id)
      }
      for (const row of rows) stores.audio_files.put(row)
    })
  }

  // ----------------------------------------------------------------- cache

  private async refreshCacheCounts(): Promise<void> {
    const [surahCount, segmentCount] = await Promise.all([
      countRecords(this.db, 'surah_cache'),
      countRecords(this.db, 'segments_cache'),
    ])
    this.cachedSurahs = surahCount
    this.cachedSegmentSets = segmentCount
  }

  async cacheStats(): Promise<CacheStats> {
    const [surahs, segmentSets, ayahRows, wordRows, segmentRows, audioFiles] = await Promise.all([
      getAllRecords<SurahCacheRow>(this.db, 'surah_cache'),
      getAllRecords<SegmentsCacheRow>(this.db, 'segments_cache'),
      countRecords(this.db, 'ayahs'),
      countRecords(this.db, 'words'),
      countRecords(this.db, 'segments'),
      countRecords(this.db, 'audio_files'),
    ])
    return {
      surahs: surahs.sort((a, b) => a.surah_id - b.surah_id),
      segment_sets: segmentSets.sort((a, b) => a.reciter_id - b.reciter_id || a.surah_id - b.surah_id),
      ayah_rows: ayahRows,
      word_rows: wordRows,
      segment_rows: segmentRows,
      audio_files: audioFiles,
    }
  }

  /** Drop every cached content piece; the boot index is refreshed separately. */
  async clearContentCache(): Promise<void> {
    for (const store of ['ayahs', 'words', 'segments', 'audio_files', 'surah_cache', 'segments_cache']) {
      await clearStore(this.db, store)
    }
    this.ayahMemory.clear()
    this.wordsMemory.clear()
    this.segmentMemory.clear()
    this.audioMemory.clear()
    this.audioGlobal = null
    this.placeholderSurahIds.clear()
    this.cachedSurahs = 0
    this.cachedSegmentSets = 0
  }

  /** Re-fetch the small boot index (surah names + reciters). */
  async reloadIndex(): Promise<ContentSummary> {
    await this.loadIndex()
    await this.refreshCacheCounts()
    return this.summary()
  }

  close(): void {
    this.db.close()
  }
}
