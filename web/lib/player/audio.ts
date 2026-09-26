import type { ContentRepository } from '../content/repository'
import type { AyahRow, ReciterRow, WordSegment } from '../content/types'

export interface ResolvedAudio {
  url: string
  durationMs: number
  /** Word ranges (word_index >= 1). Empty means proportional highlighting. */
  segments: WordSegment[]
  source: 'bundle' | 'placeholder'
}

export interface DrillAudioResolver {
  resolve(reciter: ReciterRow, ayah: AyahRow, variant?: string): Promise<ResolvedAudio>
}

const SAMPLE_RATE = 8000
const cachedUrls = new Map<string, string>()

/**
 * A deterministic placeholder clip: a soft chime, then silence to the verse's
 * estimated length. The chime makes repeat boundaries audible while a reciter
 * has no rights-cleared audio; the silence keeps long drills pleasant.
 */
function placeholderWavUrl(durationMs: number): string {
  const cacheKey = `wav:${durationMs}`
  const cached = cachedUrls.get(cacheKey)
  if (cached) return cached

  const totalSamples = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE))
  const buffer = new ArrayBuffer(44 + totalSamples * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + totalSamples * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, totalSamples * 2, true)

  const chimeSamples = Math.min(totalSamples, Math.round(0.9 * SAMPLE_RATE))
  for (let index = 0; index < totalSamples; index += 1) {
    let sample = 0
    if (index < chimeSamples) {
      const t = index / SAMPLE_RATE
      const envelope = Math.exp(-3.2 * t)
      sample =
        (Math.sin(2 * Math.PI * 523.25 * t) * 0.16 + Math.sin(2 * Math.PI * 784.88 * t) * 0.05) *
        envelope
    }
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true)
  }

  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
  cachedUrls.set(cacheKey, url)
  return url
}

export function placeholderDurationMs(ayah: AyahRow): number {
  const words = ayah.transliteration.split(/\s+/).filter(Boolean).length
  return Math.max(2600, 800 + words * 620)
}

/** A short chime for reciter previews while no audio is bundled. */
export function placeholderSampleUrl(): string {
  return placeholderWavUrl(3000)
}

export class PlaceholderDrillAudioResolver implements DrillAudioResolver {
  async resolve(reciter: ReciterRow, ayah: AyahRow, _variant?: string): Promise<ResolvedAudio> {
    void reciter
    const durationMs = placeholderDurationMs(ayah)
    return {
      url: placeholderWavUrl(durationMs),
      durationMs,
      segments: [],
      source: 'placeholder',
    }
  }
}

/**
 * Resolves audio and word timings from the lazily loaded content export.
 *
 * Timings are fetched per reciter/surah from `/content/segments/...` and win
 * even when the reciter has no rights-cleared audio yet: the placeholder chime
 * plays, while the active-word highlight follows the real segment data. A
 * missing or unreachable timing file never blocks playback.
 */
export class ContentDrillAudioResolver implements DrillAudioResolver {
  private readonly content: ContentRepository
  private readonly fallback: DrillAudioResolver

  constructor(
    content: ContentRepository,
    fallback: DrillAudioResolver = new PlaceholderDrillAudioResolver(),
  ) {
    this.content = content
    this.fallback = fallback
  }

  async resolve(reciter: ReciterRow, ayah: AyahRow, variant?: string): Promise<ResolvedAudio> {
    const [files, segmentRows] = await Promise.all([
      this.content.audioFiles(reciter.id, ayah.surah_id).catch(() => []),
      this.content.segmentsForAyah(reciter.id, ayah, variant).catch(() => []),
    ])
    const mapped: WordSegment[] = segmentRows
      .filter((segment) => segment.word_index > 0)
      .map((segment) => ({
        word_index: segment.word_index,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
      }))

    const wantedVariant = variant ?? 'default'
    const match =
      files.find(
        (file) =>
          file.kind === 'ayah' &&
          file.ayah === ayah.ayah &&
          (file.variant === wantedVariant || wantedVariant === 'default'),
      ) ??
      files.find((file) => file.kind === 'chapter' && file.chapter === ayah.surah_id) ??
      files.find((file) => Boolean(file.url))

    if (!match?.url || match.url.startsWith('placeholder')) {
      const fallback = await this.fallback.resolve(reciter, ayah, variant)
      const durationMs = Math.max(
        fallback.durationMs,
        ...mapped.map((segment) => segment.end_ms),
        placeholderDurationMs(ayah),
      )
      return {
        url: fallback.url,
        durationMs,
        segments: mapped.length > 0 ? mapped : fallback.segments,
        source: 'placeholder',
      }
    }

    const segmentEnd = mapped.length > 0 ? Math.max(...mapped.map((segment) => segment.end_ms)) : 0
    const durationMs = match.duration_ms ?? (segmentEnd || placeholderDurationMs(ayah))
    const url =
      typeof window === 'undefined' ? match.url : new URL(match.url, window.location.href).href
    return { url, durationMs, segments: mapped, source: 'bundle' }
  }
}
