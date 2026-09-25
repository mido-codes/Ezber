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
