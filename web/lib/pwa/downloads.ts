'use client'

import type { ContentRepository } from '../content/repository'
import type { UserRepository } from '../user/repository'
import { nowIso } from '../utils'

export const AUDIO_CACHE = 'ezber-audio-v1'

export interface DownloadProgress {
  files: number
  completed: number
  bytes: number
  done: boolean
}

export interface DownloadResult {
  files: number
  bytes: number
  audio: boolean
}

function downloadSettingKey(reciterId: number, surahId: number): string {
  return `downloads.state.${reciterId}.${surahId}`
}

export async function isSurahDownloaded(
  user: UserRepository,
  reciterId: number,
  surahId: number,
): Promise<boolean> {
  const raw = await user.getSetting(downloadSettingKey(reciterId, surahId))
  if (!raw) return false
  try {
    return (JSON.parse(raw) as { state?: string }).state === 'done'
  } catch {
    return false
  }
}

async function fetchIntoCache(cache: Cache, url: string): Promise<number> {
  const existing = await cache.match(url)
  if (existing) {
    const blob = await existing.clone().blob()
    return blob.size
  }
  let response: Response
  try {
    response = await fetch(url, { mode: 'cors', cache: 'no-cache' })
  } catch {
    response = await fetch(url, { mode: 'no-cors', cache: 'no-cache' })
  }
  await cache.put(url, response.clone())
  const blob = await response.blob()
  return blob.size
}

/**
 * Downloads the reciter's audio for one surah into the Cache Storage bucket the
 * service worker serves from. Content comes from the pipeline bundle; when no
 * audio files exist yet, the placeholder is generated locally and there is
 * nothing to fetch.
 */
export async function downloadSurahAudio(
  content: ContentRepository,
  user: UserRepository,
  reciterId: number,
  surahId: number,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadResult> {
  const files = (await content.audioFiles(reciterId, surahId)).filter((file) => file.url)
  if (files.length === 0 || typeof caches === 'undefined') {
    onProgress?.({ files: 0, completed: 0, bytes: 0, done: true })
    return { files: 0, bytes: 0, audio: false }
  }
  const cache = await caches.open(AUDIO_CACHE)
  let bytes = 0
  let completed = 0
  onProgress?.({ files: files.length, completed, bytes, done: false })
  for (const file of files) {
    try {
      bytes += await fetchIntoCache(cache, file.url)
    } catch {
      // A single missing file should not fail the whole download.
    }
    completed += 1
    onProgress?.({ files: files.length, completed, bytes, done: completed === files.length })
  }
  await user.setSetting(
    downloadSettingKey(reciterId, surahId),
    JSON.stringify({ state: 'done', bytes, files: files.length, updated_at: nowIso() }),
  )
  return { files: files.length, bytes, audio: true }
}

export async function clearAudioCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete(AUDIO_CACHE)
}
