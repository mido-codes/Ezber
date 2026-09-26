import type { AyahRow } from '../content/types'
import type { PresetRow } from '../user/types'

export interface DrillItem {
  ayah: AyahRow
  repeat_index: number
  repeat_count: number
}

export function repeatCountFor(
  preset: Pick<PresetRow, 'repeat_count'>,
  overrides: Record<number, number>,
  ayahNumber: number,
): number {
  return Math.max(1, overrides[ayahNumber] ?? preset.repeat_count)
}

/** Verse × repetition queue for one pass over the preset's section. */
export function buildDrillQueue(
  preset: Pick<PresetRow, 'surah_id' | 'from_ayah' | 'to_ayah' | 'repeat_count'>,
  overrides: Record<number, number>,
  ayahs: AyahRow[],
): DrillItem[] {
  const selected = ayahs
    .filter(
      (ayah) =>
        ayah.surah_id === preset.surah_id &&
        ayah.ayah >= preset.from_ayah &&
        ayah.ayah <= preset.to_ayah,
    )
    .sort((a, b) => a.ayah - b.ayah)
  const queue: DrillItem[] = []
  for (const ayah of selected) {
    const repeatCount = repeatCountFor(preset, overrides, ayah.ayah)
    for (let repeatIndex = 1; repeatIndex <= repeatCount; repeatIndex += 1) {
      queue.push({ ayah, repeat_index: repeatIndex, repeat_count: repeatCount })
    }
  }
  return queue
}

export function totalRepetitions(
  preset: Pick<PresetRow, 'surah_id' | 'from_ayah' | 'to_ayah' | 'repeat_count'>,
  overrides: Record<number, number>,
  ayahs: AyahRow[],
): number {
  return buildDrillQueue(preset, overrides, ayahs).length
}

/** Slightly over one second per Arabic word, a rough but useful estimate. */
export function estimateDurationMs(totalRepeats: number, ayahs: AyahRow[]): number {
  const wordCount = ayahs.reduce(
    (total, ayah) => total + ayah.text_uthmani.split(/\s+/).filter(Boolean).length,
    0,
  )
  const averageVerseMs = Math.max(3200, (wordCount / Math.max(1, ayahs.length)) * 720)
  return Math.round(totalRepeats * averageVerseMs)
}

/**
 * Map a flat plan index onto a verse/repeat without loading any content. Used
 * by Home for the continue card so the home screen never fetches a surah.
 */
export function resumePointFor(
  preset: Pick<PresetRow, 'from_ayah' | 'to_ayah' | 'repeat_count'>,
  overrides: Record<number, number>,
  planIndex: number,
): { verse: number; repeat: number; repeatTotal: number; indexInPass: number; totalInPass: number } {
  const counts: { ayah: number; count: number }[] = []
  for (let ayah = preset.from_ayah; ayah <= preset.to_ayah; ayah += 1) {
    counts.push({ ayah, count: Math.max(1, overrides[ayah] ?? preset.repeat_count) })
  }
  const totalInPass = counts.reduce((total, entry) => total + entry.count, 0)
  const indexInPass = totalInPass > 0 ? ((planIndex % totalInPass) + totalInPass) % totalInPass : 0
  let cursor = indexInPass
  for (const entry of counts) {
    if (cursor < entry.count) {
      return {
        verse: entry.ayah,
        repeat: cursor + 1,
        repeatTotal: entry.count,
        indexInPass,
        totalInPass,
      }
    }
    cursor -= entry.count
  }
  const first = counts[0] ?? { ayah: preset.from_ayah, count: 1 }
  return {
    verse: first.ayah,
    repeat: 1,
    repeatTotal: first.count,
    indexInPass: 0,
    totalInPass,
  }
}
