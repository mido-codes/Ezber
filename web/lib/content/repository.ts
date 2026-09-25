import {
  clearStore,
  countRecords,
  getAllByIndex,
  getAllRecords,
  getFirstByIndex,
  getRecord,
  openDatabase,
  putRecords,
  type StoreSpec,
} from '../db/idb'
import { fetchContentBundle, normalizeBundle, type FetchedBundle } from './bundle'
import {
  placeholderAyah,
  placeholderAyahsFor,
  placeholderAudioFiles,
  placeholderReciters,
  placeholderSegments,
  placeholderSurahs,
  placeholderSummary,
  placeholderWords,
} from './placeholder'
import type {
  AudioFileRow,
  AyahRow,
  ContentMetaRow,
  ContentSummary,
  LicenseEntry,
  ReciterRow,
  SegmentRow,
  SurahRow,
  WordRow,
} from './types'

export const CONTENT_DB_NAME = 'ezber-content'
export const CONTENT_DB_VERSION = 1

const CONTENT_STORES: StoreSpec[] = [
  { name: 'content_meta', keyPath: 'key' },
  { name: 'surahs', keyPath: 'id' },
  {
    name: 'ayahs',
    keyPath: 'id',
    indexes: [
      { name: 'verse_key', keyPath: 'verse_key', unique: true },
      { name: 'surah_id', keyPath: 'surah_id' },
    ],
  },
  { name: 'words', keyPath: ['ayah_id', 'position'], indexes: [{ name: 'ayah_id', keyPath: 'ayah_id' }] },
  { name: 'reciters', keyPath: 'id' },
  {
    name: 'audio_files',
    keyPath: 'id',
    indexes: [
      { name: 'reciter_id', keyPath: 'reciter_id' },
      { name: 'surah_id', keyPath: 'surah_id' },
    ],
  },
  {
    name: 'segments',
    keyPath: ['reciter_id', 'variant', 'ayah_id', 'word_index'],
    indexes: [
      { name: 'ayah_id', keyPath: 'ayah_id' },
      { name: 'reciter_id', keyPath: 'reciter_id' },
    ],
  },
  { name: 'transliterations', keyPath: 'id' },
  { name: 'transliteration_rows', keyPath: ['transliteration_id', 'ayah_id'] },
  { name: 'licenses', keyPath: 'id' },
]

interface MetaShape {
  mode: 'bundle' | 'placeholder'
  schema_version: number
  pipeline_version?: string
  bundle_id: string
  counts: Record<string, number>
  licenses: LicenseEntry[]
  attribution: string[]
}

const DEFAULT_META: MetaShape = placeholderSummary as MetaShape

async function readMeta(db: IDBDatabase): Promise<MetaShape> {
  const rows = await getAllRecords<ContentMetaRow>(db, 'content_meta')
  if (rows.length === 0) return DEFAULT_META
  const map = new Map(rows.map((row) => [row.key, row.value]))
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
    mode: (map.get('mode') as MetaShape['mode']) ?? 'placeholder',
    schema_version: parse('schema_version', 1),
    pipeline_version: map.get('pipeline_version'),
    bundle_id: map.get('bundle_id') ?? 'placeholder',
    counts: parse('counts', DEFAULT_META.counts),
    licenses: parse('licenses', DEFAULT_META.licenses),
    attribution: parse('attribution', DEFAULT_META.attribution),
  }
}

async function writeMeta(db: IDBDatabase, meta: MetaShape): Promise<void> {
  const rows: ContentMetaRow[] = [
    { key: 'mode', value: meta.mode },
    { key: 'schema_version', value: String(meta.schema_version) },
    { key: 'bundle_id', value: meta.bundle_id },
    { key: 'counts', value: JSON.stringify(meta.counts) },
    { key: 'licenses', value: JSON.stringify(meta.licenses) },
    { key: 'attribution', value: JSON.stringify(meta.attribution) },
    { key: 'installed_at', value: new Date().toISOString() },
  ]
  if (meta.pipeline_version) rows.push({ key: 'pipeline_version', value: meta.pipeline_version })
  await putRecords(db, 'content_meta', rows)
}

const CONTENT_TABLE_NAMES = [
  'surahs',
  'ayahs',
  'words',
  'reciters',
  'audio_files',
  'segments',
  'transliterations',
  'transliteration_rows',
  'licenses',
] as const

async function clearContentTables(db: IDBDatabase): Promise<void> {
  for (const name of CONTENT_TABLE_NAMES) {
    await clearStore(db, name)
  }
}

async function importBundle(db: IDBDatabase, fetched: FetchedBundle): Promise<MetaShape> {
  const bundle = normalizeBundle(fetched.manifest, fetched.parts)
  await clearContentTables(db)
  await putRecords(db, 'surahs', bundle.surahs)
  await putRecords(db, 'reciters', bundle.reciters)
  await putRecords(db, 'audio_files', bundle.audio_files)
  await putRecords(db, 'transliterations', bundle.transliterations)
  await putRecords(db, 'transliteration_rows', bundle.transliteration_rows)
  await putRecords(db, 'licenses', bundle.licenses)
  for (let index = 0; index < bundle.ayahs.length; index += 2000) {
    await putRecords(db, 'ayahs', bundle.ayahs.slice(index, index + 2000))
  }
  for (let index = 0; index < bundle.words.length; index += 5000) {
    await putRecords(db, 'words', bundle.words.slice(index, index + 5000))
  }
  for (let index = 0; index < bundle.segments.length; index += 5000) {
    await putRecords(db, 'segments', bundle.segments.slice(index, index + 5000))
  }
  const meta: MetaShape = {
    mode: 'bundle',
    schema_version: bundle.manifest.schema_version,
    pipeline_version: bundle.manifest.pipeline_version,
    bundle_id: bundle.manifest.bundle_id ?? 'bundle',
    counts: {
      surahs: bundle.surahs.length,
      ayahs: bundle.ayahs.length,
      words: bundle.words.length,
      reciters: bundle.reciters.length,
      audio_files: bundle.audio_files.length,
      segments: bundle.segments.length,
    },
    licenses: bundle.licenses,
    attribution: bundle.attribution,
  }
  await writeMeta(db, meta)
  return meta
}

async function seedPlaceholder(db: IDBDatabase): Promise<MetaShape> {
  const surahs = await countRecords(db, 'surahs')
  if (surahs === 0) {
    await putRecords(db, 'surahs', placeholderSurahs)
    await putRecords(db, 'reciters', placeholderReciters)
    await putRecords(db, 'audio_files', placeholderAudioFiles)
  }
  await writeMeta(db, { ...(placeholderSummary as MetaShape) })
  return placeholderSummary as MetaShape
}

export interface OpenContentOptions {
  baseUrl?: string
  /** Skip the network probe and use whatever is already installed. */
  offline?: boolean
  onImport?: (message: string) => void
}

export class ContentRepository {
  static async open(options: OpenContentOptions = {}): Promise<ContentRepository> {
    const db = await openDatabase(CONTENT_DB_NAME, CONTENT_DB_VERSION, CONTENT_STORES)
    let meta = await readMeta(db)
    const surahCount = await countRecords(db, 'surahs')
    const installed = surahCount > 0

    let fetched: FetchedBundle | null = null
    if (!options.offline && typeof fetch === 'function') {
      try {
        fetched = await fetchContentBundle(options.baseUrl)
      } catch (error) {
        options.onImport?.(
          `Content bundle probe failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    if (fetched) {
      const incomingId = fetched.manifest.bundle_id ?? 'bundle'
      if (!installed || meta.bundle_id !== incomingId) {
        options.onImport?.('Installing content bundle…')
        meta = await importBundle(db, fetched)
      }
    } else if (!installed) {
      options.onImport?.('Content bundle not found — seeding placeholder content.')
      meta = await seedPlaceholder(db)
    } else if (meta.mode === 'placeholder' && (await countRecords(db, 'reciters')) === 0) {
      meta = await seedPlaceholder(db)
    }

    return new ContentRepository(db, meta)
  }

  private readonly db: IDBDatabase
  private meta: MetaShape

  private constructor(db: IDBDatabase, meta: MetaShape) {
    this.db = db
    this.meta = meta
  }

  summary(): ContentSummary {
    return {
      mode: this.meta.mode,
      schema_version: this.meta.schema_version,
      pipeline_version: this.meta.pipeline_version,
      bundle_id: this.meta.bundle_id,
      counts: this.meta.counts,
      licenses: this.meta.licenses,
      attribution: this.meta.attribution,
    }
  }

  isPlaceholder(): boolean {
    return this.meta.mode === 'placeholder'
  }

  async surahs(): Promise<SurahRow[]> {
    const rows = await getAllRecords<SurahRow>(this.db, 'surahs')
    return rows.sort((a, b) => a.id - b.id)
  }

  async surah(id: number): Promise<SurahRow | undefined> {
    return getRecord<SurahRow>(this.db, 'surahs', id)
  }

  async ayahs(surahId: number): Promise<AyahRow[]> {
    let rows = await getAllByIndex<AyahRow>(this.db, 'ayahs', 'surah_id', surahId)
    if (rows.length === 0 && this.meta.mode === 'placeholder') {
      rows = placeholderAyahsFor(surahId)
      await putRecords(this.db, 'ayahs', rows)
      const words: WordRow[] = []
      const segments: SegmentRow[] = []
      for (const ayah of rows) {
        words.push(...placeholderWords(ayah))
        segments.push(...placeholderSegments(ayah))
      }
      await putRecords(this.db, 'words', words)
      await putRecords(this.db, 'segments', segments)
    }
    return rows.sort((a, b) => a.ayah - b.ayah)
  }

  async ayah(verseKey: string): Promise<AyahRow | undefined> {
    const found = await getFirstByIndex<AyahRow>(this.db, 'ayahs', 'verse_key', verseKey)
    if (found) return found
    if (this.meta.mode === 'placeholder') {
      const [surahId, ayah] = verseKey.split(':').map(Number)
      if (Number.isInteger(surahId) && Number.isInteger(ayah)) {
        return placeholderAyah(surahId, ayah)
      }
    }
    return undefined
  }

  async reciters(): Promise<ReciterRow[]> {
    const rows = await getAllRecords<ReciterRow>(this.db, 'reciters')
    return rows.sort((a, b) => a.id - b.id)
  }

  async reciter(id: number): Promise<ReciterRow | undefined> {
    return getRecord<ReciterRow>(this.db, 'reciters', id)
  }

  async audioFiles(reciterId: number, surahId?: number): Promise<AudioFileRow[]> {
    const rows = await getAllByIndex<AudioFileRow>(this.db, 'audio_files', 'reciter_id', reciterId)
    const filtered = surahId === undefined ? rows : rows.filter((row) => row.surah_id === surahId)
    return filtered.sort((a, b) => (a.ayah ?? 0) - (b.ayah ?? 0))
  }

  async segments(reciterId: number, ayahId: number, variant = 'default'): Promise<SegmentRow[]> {
    const rows = await getAllByIndex<SegmentRow>(this.db, 'segments', 'ayah_id', ayahId)
    return rows
      .filter((row) => row.reciter_id === reciterId && row.variant === variant)
      .sort((a, b) => a.word_index - b.word_index)
  }

  async words(ayahId: number): Promise<WordRow[]> {
    const rows = await getAllByIndex<WordRow>(this.db, 'words', 'ayah_id', ayahId)
    return rows.sort((a, b) => a.position - b.position)
  }

  async licenses(): Promise<LicenseEntry[]> {
    return getAllRecords<LicenseEntry>(this.db, 'licenses')
  }

  /** Re-probe /content/ and re-import when a new bundle is present. */
  async reimport(baseUrl?: string): Promise<ContentSummary> {
    const fetched = await fetchContentBundle(baseUrl)
    if (!fetched) throw new Error('No content bundle found at /content/.')
    this.meta = await importBundle(this.db, fetched)
    return this.summary()
  }

  close(): void {
    this.db.close()
  }
}
