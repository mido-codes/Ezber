/**
 * Verse identity helpers. `verse_key` is "surah:ayah" (e.g. "55:3") and is the
 * stable cross-dataset identity in schema/content_schema.sql.
 */
export type VerseKey = string

export function verseKey(surahId: number, ayah: number): VerseKey {
  return `${surahId}:${ayah}`
}

export function parseVerseKey(key: VerseKey): { surahId: number; ayah: number } {
  const [surahRaw, ayahRaw] = key.split(':')
  return { surahId: Number(surahRaw), ayah: Number(ayahRaw) }
}

export function isValidVerseKey(key: string | null | undefined): boolean {
  if (!key) return false
  const [surah, ayah] = key.split(':')
  const s = Number(surah)
  const a = Number(ayah)
  return Number.isInteger(s) && Number.isInteger(a) && s >= 1 && s <= 114 && a >= 1
}

/** "1–5" with an en dash, matching the kit copy. */
export function formatRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`
}

export interface VerseRange {
  start: number
  end: number
}

export function rangeCount(range: VerseRange): number {
  return Math.max(0, range.end - range.start + 1)
}

export function rangeContains(range: VerseRange, ayah: number): boolean {
  return ayah >= range.start && ayah <= range.end
}

export function clampRange(range: VerseRange, verseCount: number): VerseRange {
  const lower = Math.min(Math.max(1, range.start), Math.max(1, verseCount))
  const upper = Math.min(Math.max(lower, range.end), Math.max(1, verseCount))
  return { start: lower, end: upper }
}
