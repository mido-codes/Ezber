import {
  clearStore,
  deleteRecord,
  getAllByIndex,
  getAllRecords,
  getRecord,
  openDatabase,
  putRecord,
  putRecords,
  runTransaction,
  requestResult,
  type StoreSpec,
} from '../db/idb'
import { nowIso, uid } from '../utils'
import { verseKey as makeVerseKey } from '../verses'
import {
  SETTING_DEFAULTS,
  type MemorizationState,
  type NoteRow,
  type PlanStateRow,
  type PresetRow,
  type PresetVerseRow,
  type ProgressRow,
  type Rating,
  type RatingRow,
  type SchemaVersionRow,
  type SessionRow,
  type SettingRow,
  type UserExport,
} from './types'

export const USER_DB_NAME = 'ezber-user'
export const USER_DB_VERSION = 1

const USER_STORES: StoreSpec[] = [
  { name: 'schema_version', keyPath: 'id' },
  { name: 'presets', keyPath: 'id' },
  { name: 'preset_verses', keyPath: ['preset_id', 'ayah'] },
  { name: 'progress', keyPath: ['preset_id', 'ayah'], indexes: [{ name: 'verse_key', keyPath: 'verse_key' }] },
  { name: 'sessions', keyPath: 'id', autoIncrement: true, indexes: [{ name: 'preset_id', keyPath: 'preset_id' }] },
  { name: 'plan_state', keyPath: 'preset_id' },
  { name: 'notes', keyPath: 'id', autoIncrement: true, indexes: [{ name: 'verse_key', keyPath: 'verse_key' }] },
  { name: 'settings', keyPath: 'key' },
  { name: 'ratings', keyPath: 'id', autoIncrement: true, indexes: [{ name: 'verse_key', keyPath: 'verse_key' }] },
]

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

export interface NewPreset {
  name: string
  surah_id: number
  from_ayah: number
  to_ayah: number
  repeat_count: number
  reciter_id: number
  show_arabic: 0 | 1
  show_transliteration: 0 | 1
  pause_between_repeat_ms: number
  section_repeats: number
  download_scope?: PresetRow['download_scope']
}

export class UserRepository {
  static async open(): Promise<UserRepository> {
    const db = await openDatabase(USER_DB_NAME, USER_DB_VERSION, USER_STORES)
    const repository = new UserRepository(db)
    await repository.ensureSchema()
    return repository
  }

  private readonly db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
  }

  private async ensureSchema(): Promise<void> {
    const row = await getRecord<SchemaVersionRow>(this.db, 'schema_version', 'current')
    if (!row) {
      await putRecord(this.db, 'schema_version', { id: 'current', version: USER_DB_VERSION })
      const settings: SettingRow[] = Object.entries(SETTING_DEFAULTS).map(([key, value]) => ({ key, value }))
      await putRecords(this.db, 'settings', settings)
      await this.setSetting('theme', 'system')
      await this.setSetting('language', detectLanguage())
    }
  }

  // ----------------------------------------------------------------- settings

  async getSetting(key: string): Promise<string> {
    const row = await getRecord<SettingRow>(this.db, 'settings', key)
    return row?.value ?? SETTING_DEFAULTS[key] ?? ''
  }

  async setSetting(key: string, value: string): Promise<void> {
    await putRecord(this.db, 'settings', { key, value })
  }

  async allSettings(): Promise<Record<string, string>> {
    const rows = await getAllRecords<SettingRow>(this.db, 'settings')
    const map: Record<string, string> = { ...SETTING_DEFAULTS }
    for (const row of rows) map[row.key] = row.value
    return map
  }

  // ------------------------------------------------------------------ presets

  async listPresets(): Promise<PresetRow[]> {
    const rows = await getAllRecords<PresetRow>(this.db, 'presets')
    return rows.sort((a, b) => {
      const aTime = a.last_used_at ?? a.created_at
      const bTime = b.last_used_at ?? b.created_at
      return bTime.localeCompare(aTime)
    })
  }

  async getPreset(id: string): Promise<PresetRow | undefined> {
    return getRecord<PresetRow>(this.db, 'presets', id)
  }

  async createPreset(input: NewPreset, overrides: Record<number, number> = {}): Promise<PresetRow> {
    const preset: PresetRow = {
      id: uid(),
      name: input.name,
      surah_id: input.surah_id,
      from_ayah: input.from_ayah,
      to_ayah: input.to_ayah,
      repeat_count: input.repeat_count,
      reciter_id: input.reciter_id,
      transliteration_id: null,
      translation_id: null,
      show_arabic: input.show_arabic,
      show_transliteration: input.show_transliteration,
      show_translation: 0,
      pause_between_repeat_ms: input.pause_between_repeat_ms,
      playback_mode: 'ayah',
      download_scope: input.download_scope ?? 'inherit',
      created_at: nowIso(),
      updated_at: null,
      last_used_at: null,
      section_repeats: input.section_repeats,
    }
    await this.savePreset(preset, overrides)
    return preset
  }

  async savePreset(preset: PresetRow, overrides: Record<number, number> = {}): Promise<void> {
    const presetVerses: PresetVerseRow[] = Object.entries(overrides).map(([ayah, repeatCount]) => ({
      preset_id: preset.id,
      ayah: Number(ayah),
      repeat_count: repeatCount,
    }))
    await runTransaction(this.db, ['presets', 'preset_verses'], 'readwrite', (stores) => {
      stores.presets.put(preset)
      const range = stores.preset_verses
      range.delete(IDBKeyRange.bound([preset.id, 0], [preset.id, 1_000_000]))
      for (const row of presetVerses) range.put(row)
    })
  }

  async presetOverrides(presetId: string): Promise<Record<number, number>> {
    const rows = (await getAllRecords<PresetVerseRow>(this.db, 'preset_verses')).filter(
      (row) => row.preset_id === presetId,
    )
    const map: Record<number, number> = {}
    for (const row of rows) map[row.ayah] = row.repeat_count
    return map
  }

  async duplicatePreset(id: string): Promise<PresetRow | undefined> {
    const preset = await this.getPreset(id)
    if (!preset) return undefined
    const copy: PresetRow = {
      ...preset,
      id: uid(),
      name: `${preset.name} (copy)`,
      created_at: nowIso(),
      updated_at: null,
      last_used_at: null,
    }
    const overrides = await this.presetOverrides(id)
    await this.savePreset(copy, overrides)
    return copy
  }

  async deletePreset(id: string): Promise<void> {
    await runTransaction(
      this.db,
      ['presets', 'preset_verses', 'progress', 'plan_state'],
      'readwrite',
      (stores) => {
        stores.presets.delete(id)
        stores.preset_verses.delete(IDBKeyRange.bound([id, 0], [id, 1_000_000]))
        stores.progress.delete(IDBKeyRange.bound([id, 0], [id, 1_000_000]))
        stores.plan_state.delete(id)
      },
    )
  }

  async touchPreset(id: string): Promise<void> {
    const preset = await this.getPreset(id)
    if (!preset) return
    preset.last_used_at = nowIso()
    await putRecord(this.db, 'presets', preset)
  }

  // ----------------------------------------------------------------- progress

  async recordRepeat(presetId: string, ayah: number, verseKey: string): Promise<void> {
    const existing = await getRecord<ProgressRow>(this.db, 'progress', [presetId, ayah])
    const row: ProgressRow = existing ?? {
      preset_id: presetId,
      ayah,
      verse_key: verseKey,
      repetitions_done: 0,
      memorization_state: 'learning',
      last_played_at: null,
      next_review_at: null,
    }
    row.repetitions_done += 1
    row.last_played_at = nowIso()
    row.verse_key = verseKey
    if (row.memorization_state === 'learning' && !row.next_review_at) {
      row.next_review_at = daysFromNow(2)
    }
    await putRecord(this.db, 'progress', row)
  }

  async progressForPreset(presetId: string): Promise<ProgressRow[]> {
    const rows = await this.allProgress()
    return rows.filter((row) => row.preset_id === presetId)
  }

  async allProgress(): Promise<ProgressRow[]> {
    return getAllRecords<ProgressRow>(this.db, 'progress')
  }

  async progressForVerse(verseKey: string): Promise<ProgressRow[]> {
    return getAllByIndex<ProgressRow>(this.db, 'progress', 'verse_key', verseKey)
  }

  async rateVerse(verseKey: string, rating: Rating): Promise<MemorizationState> {
    const ratingRow: RatingRow = { verse_key: verseKey, rating, created_at: nowIso() }
    const state = await runTransaction(
      this.db,
      ['ratings', 'progress'],
      'readwrite',
      async (stores) => {
        stores.ratings.put(ratingRow)
        const all = await requestResult<RatingRow[]>(stores.ratings.index('verse_key').getAll(verseKey))
        const solid = all.filter((row) => row.rating === 'solid').length
        const nextState: MemorizationState =
          rating === 'shaky' ? 'learning' : solid >= 6 ? 'memorized' : solid >= 3 ? 'review' : 'learning'
        const nextReview =
          rating === 'shaky' ? daysFromNow(1) : solid >= 6 ? daysFromNow(21) : solid >= 3 ? daysFromNow(7) : daysFromNow(2)
        const progress = await requestResult<ProgressRow[]>(
          stores.progress.index('verse_key').getAll(verseKey),
        )
        for (const row of progress) {
          row.memorization_state = nextState
          row.next_review_at = nextReview
          stores.progress.put(row)
        }
        return nextState
      },
    )
    return state
  }

  async ratingsForVerse(verseKey: string): Promise<RatingRow[]> {
    const rows = await getAllByIndex<RatingRow>(this.db, 'ratings', 'verse_key', verseKey)
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  async reviewQueue(limit = 10): Promise<ProgressRow[]> {
    const rows = await this.allProgress()
    const now = Date.now()
    const due = rows.filter((row) => {
      if (row.next_review_at && new Date(row.next_review_at).getTime() <= now) return true
      if (
        (row.memorization_state === 'learning' || row.memorization_state === 'review') &&
        row.last_played_at &&
        now - new Date(row.last_played_at).getTime() > 7 * 86_400_000
      ) {
        return true
      }
      return false
    })
    due.sort((a, b) => (a.next_review_at ?? '').localeCompare(b.next_review_at ?? ''))
    return due.slice(0, limit)
  }

  // ----------------------------------------------------------------- sessions

  async activeSession(presetId: string): Promise<SessionRow | undefined> {
    const rows = await getAllByIndex<SessionRow>(this.db, 'sessions', 'preset_id', presetId)
    return rows
      .filter((row) => row.ended_at === null)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
  }

  async startSession(presetId: string): Promise<SessionRow> {
    const row: SessionRow = {
      preset_id: presetId,
      started_at: nowIso(),
      ended_at: null,
      verses_covered: 0,
      repetitions: 0,
      interrupted: 0,
    }
    const id = await runTransaction(this.db, ['sessions'], 'readwrite', (stores) =>
      requestResult<IDBValidKey>(stores.sessions.add(row)),
    )
    return { ...row, id: Number(id) }
  }

  async updateSession(id: number, patch: Partial<Omit<SessionRow, 'id'>>): Promise<void> {
    const existing = await getRecord<SessionRow>(this.db, 'sessions', id)
    if (!existing) return
    await putRecord(this.db, 'sessions', { ...existing, ...patch, id })
  }

  async recentSessions(limit = 10): Promise<SessionRow[]> {
    const rows = await getAllRecords<SessionRow>(this.db, 'sessions')
    return rows
      .filter((row) => row.ended_at !== null)
      .sort((a, b) => (b.started_at).localeCompare(a.started_at))
      .slice(0, limit)
  }

  async weekStats(): Promise<{ days: number; verses: number; repetitions: number }> {
    const rows = await getAllRecords<SessionRow>(this.db, 'sessions')
    const cutoff = Date.now() - 7 * 86_400_000
    const week = rows.filter((row) => new Date(row.started_at).getTime() >= cutoff)
    const days = new Set(week.map((row) => row.started_at.slice(0, 10))).size
    return {
      days,
      verses: week.reduce((total, row) => total + row.verses_covered, 0),
      repetitions: week.reduce((total, row) => total + row.repetitions, 0),
    }
  }

  // --------------------------------------------------------------- plan state

  async planState(presetId: string): Promise<PlanStateRow | undefined> {
    return getRecord<PlanStateRow>(this.db, 'plan_state', presetId)
  }

  async savePlanState(row: PlanStateRow): Promise<void> {
    await putRecord(this.db, 'plan_state', row)
  }

  // -------------------------------------------------------------------- notes

  async notesForVerse(verseKey: string): Promise<NoteRow[]> {
    const rows = await getAllByIndex<NoteRow>(this.db, 'notes', 'verse_key', verseKey)
    return rows.sort((a, b) => (b.created_at).localeCompare(a.created_at))
  }

  async listNotes(): Promise<NoteRow[]> {
    const rows = await getAllRecords<NoteRow>(this.db, 'notes')
    return rows.sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at))
  }

  async saveNote(input: { verse_key: string; body_md: string }): Promise<void> {
    const row: NoteRow = {
      verse_key: input.verse_key,
      body_md: input.body_md,
      created_at: nowIso(),
      updated_at: null,
    }
    await putRecord(this.db, 'notes', row)
  }

  async updateNote(id: number, bodyMd: string): Promise<void> {
    const existing = await getRecord<NoteRow>(this.db, 'notes', id)
    if (!existing) return
    await putRecord(this.db, 'notes', { ...existing, body_md: bodyMd, updated_at: nowIso() })
  }

  async deleteNote(id: number): Promise<void> {
    await deleteRecord(this.db, 'notes', id)
  }

  async searchNotes(query: string): Promise<NoteRow[]> {
    const needle = query.trim().toLowerCase()
    const rows = await this.listNotes()
    if (!needle) return rows
    return rows.filter((row) =>
      `${row.body_md} ${row.verse_key}`.toLowerCase().includes(needle),
    )
  }

  // ------------------------------------------------------------- export/import

  async exportUserData(): Promise<UserExport> {
    const [presets, presetVerses, progress, sessions, planState, notes, settings, ratings] =
      await Promise.all([
        getAllRecords<PresetRow>(this.db, 'presets'),
        getAllRecords<PresetVerseRow>(this.db, 'preset_verses'),
        getAllRecords<ProgressRow>(this.db, 'progress'),
        getAllRecords<SessionRow>(this.db, 'sessions'),
        getAllRecords<PlanStateRow>(this.db, 'plan_state'),
        getAllRecords<NoteRow>(this.db, 'notes'),
        getAllRecords<SettingRow>(this.db, 'settings'),
        getAllRecords<RatingRow>(this.db, 'ratings'),
      ])
    return {
      format: 'ezber-user/1',
      exported_at: nowIso(),
      schema_version: USER_DB_VERSION,
      presets,
      preset_verses: presetVerses,
      progress,
      sessions,
      plan_state: planState,
      notes,
      settings,
      ratings,
    }
  }

  async importUserData(data: UserExport): Promise<void> {
    if (data.format !== 'ezber-user/1') throw new Error('Unsupported export format')
    const stores = ['presets', 'preset_verses', 'progress', 'sessions', 'plan_state', 'notes', 'settings', 'ratings']
    for (const store of stores) await clearStore(this.db, store)
    await putRecords(this.db, 'presets', data.presets ?? [])
    await putRecords(this.db, 'preset_verses', data.preset_verses ?? [])
    await putRecords(this.db, 'progress', data.progress ?? [])
    await putRecords(this.db, 'sessions', data.sessions ?? [])
    await putRecords(this.db, 'plan_state', data.plan_state ?? [])
    await putRecords(this.db, 'notes', data.notes ?? [])
    await putRecords(this.db, 'ratings', data.ratings ?? [])
    await putRecords(this.db, 'settings', data.settings ?? [])
    await this.setSetting('placeholder.seeded', '1')
  }

  async resetUserData(): Promise<void> {
    const stores = ['presets', 'preset_verses', 'progress', 'sessions', 'plan_state', 'notes', 'settings', 'ratings']
    for (const store of stores) await clearStore(this.db, store)
    const settings: SettingRow[] = Object.entries(SETTING_DEFAULTS).map(([key, value]) => ({
      key,
      value: key === 'placeholder.seeded' ? '1' : value,
    }))
    await putRecords(this.db, 'settings', settings)
    await this.setSetting('language', detectLanguage())
  }

  // ------------------------------------------------------------- demo content

  async hasSeededPlaceholderData(): Promise<boolean> {
    return (await this.getSetting('placeholder.seeded')) === '1'
  }

  async seedDemoData(defaultReciterId: number): Promise<void> {
    const now = nowIso()
    const preset = (overrides: Partial<PresetRow>): PresetRow => ({
      id: uid(),
      name: '',
      surah_id: 55,
      from_ayah: 1,
      to_ayah: 5,
      repeat_count: 5,
      reciter_id: defaultReciterId,
      transliteration_id: null,
      translation_id: null,
      show_arabic: 0,
      show_transliteration: 1,
      show_translation: 0,
      pause_between_repeat_ms: 500,
      playback_mode: 'ayah',
      download_scope: 'inherit',
      created_at: now,
      updated_at: null,
      last_used_at: null,
      section_repeats: 1,
      ...overrides,
    })

    const rahman = preset({ name: 'Ar-Rahman 1–5' })
    const mulk = preset({
      name: 'Al-Mulk evening',
      surah_id: 67,
      to_ayah: 5,
      repeat_count: 3,
    })
    const fatihah = preset({
      name: 'Al-Fatihah warm-up',
      surah_id: 1,
      to_ayah: 7,
      repeat_count: 3,
      show_arabic: 1,
    })

    await this.savePreset(rahman, { 5: 8 })
    await this.savePreset(mulk)
    await this.savePreset(fatihah)

    const progress: ProgressRow[] = [
      {
        preset_id: rahman.id,
        ayah: 1,
        verse_key: makeVerseKey(55, 1),
        repetitions_done: 12,
        memorization_state: 'review',
        last_played_at: new Date(Date.now() - 3_600_000).toISOString(),
        next_review_at: daysFromNow(7),
      },
      {
        preset_id: rahman.id,
        ayah: 2,
        verse_key: makeVerseKey(55, 2),
        repetitions_done: 7,
        memorization_state: 'learning',
        last_played_at: new Date(Date.now() - 3_500_000).toISOString(),
        next_review_at: daysFromNow(2),
      },
      {
        preset_id: rahman.id,
        ayah: 3,
        verse_key: makeVerseKey(55, 3),
        repetitions_done: 2,
        memorization_state: 'learning',
        last_played_at: new Date(Date.now() - 3_400_000).toISOString(),
        next_review_at: daysFromNow(2),
      },
      {
        preset_id: fatihah.id,
        ayah: 1,
        verse_key: makeVerseKey(1, 1),
        repetitions_done: 31,
        memorization_state: 'memorized',
        last_played_at: new Date(Date.now() - 86_400_000).toISOString(),
        next_review_at: daysFromNow(21),
      },
    ]
    await putRecords(this.db, 'progress', progress)

    await this.saveNote({
      verse_key: makeVerseKey(55, 1),
      body_md: 'Start low and let the first line settle before repeating.',
    })
    await this.saveNote({
      verse_key: makeVerseKey(55, 4),
      body_md: 'Watch the madd on "al-bayan".',
    })

    const session = await this.startSession(rahman.id)
    if (session.id !== undefined) {
      await this.updateSession(session.id, {
        started_at: new Date(Date.now() - 3_600_000).toISOString(),
        repetitions: 7,
        verses_covered: 1,
      })
    }
    await this.savePlanState({
      preset_id: rahman.id,
      plan_index: 7,
      position_ms: 0,
      repetition_counters_json: JSON.stringify({ pass: 1, index: 7, items: 25 }),
      updated_at: now,
    })
    await this.setSetting('ui.last_preset_id', rahman.id)
    await this.setSetting('placeholder.seeded', '1')
  }

  close(): void {
    this.db.close()
  }
}

function detectLanguage(): 'en' | 'tr' {
  if (typeof navigator === 'undefined') return 'en'
  const languages = navigator.languages ?? [navigator.language]
  for (const language of languages) {
    if (language?.toLowerCase().startsWith('tr')) return 'tr'
  }
  return 'en'
}

export async function userStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0 }
  }
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}
