import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import 'fake-indexeddb/auto'
import { fileFetch } from './helpers/fixture'
import {
  buildAyahIdResolver,
  normalizeIndex,
  normalizeSegmentsDocument,
  normalizeSurahDocument,
} from '../lib/content/bundle'
import { ContentRepository } from '../lib/content/repository'

/**
 * Contract test against the Python grouped exporter's real output. It runs when
 * an export is available (EZBER_CONTENT_EXPORT, or ../content-pipeline/build/web
 * inside the repo) and skips otherwise, so CI without a built bundle still
 * passes. The committed fixture is generated from this same output.
 */
const exportDir = resolve(
  process.env.EZBER_CONTENT_EXPORT ?? join(__dirname, '..', '..', '..', 'content-pipeline', 'build', 'web'),
)
const hasExport = existsSync(join(exportDir, 'index.json'))
const skip = hasExport ? false : `no pipeline export at ${exportDir} (set EZBER_CONTENT_EXPORT)`

test('the real pipeline index decodes into a bundle with real surahs and reciters', { skip }, async () => {
  const index = normalizeIndex(JSON.parse(readFileSync(join(exportDir, 'index.json'), 'utf8')))
  assert.ok(index, 'normalizeIndex returned null for the real grouped index')
  assert.equal(index?.layout, 'grouped')
  assert.equal(index?.surahs.length, 114)
  assert.equal(index?.reciters.length, 11)
  assert.ok((index?.surahs[54].name_latin ?? '').length > 0)
  assert.ok((index?.files.length ?? 0) > 1000)
  assert.equal(index?.surah_path, 'surahs/{surah_id}.json')
  assert.equal(index?.segments_path, 'segments/{reciter_id}/{surah_id}.json')
  assert.equal(index?.licenses_path, 'licenses.json')
  assert.equal(index?.audio_path, 'audio-files.json')
})

test('a real surah document yields ayahs, transliteration and words', { skip }, async () => {
  const index = normalizeIndex(JSON.parse(readFileSync(join(exportDir, 'index.json'), 'utf8')))
  assert.ok(index)
  const surah = index!.surahs.find((entry) => entry.id === 1)
  assert.ok(surah)
  const document = normalizeSurahDocument(
    JSON.parse(readFileSync(join(exportDir, 'surahs', '1.json'), 'utf8')),
    surah!,
    buildAyahIdResolver(index!.surahs),
  )
  assert.equal(document.ayahs.length, 7)
  assert.equal(document.ayahs[0].transliteration, 'Bismi Allahi alrrahmani alrraheemi')
  assert.ok(document.words.length >= 29)
  assert.equal(document.words[0].text_uthmani, 'بِسْمِ')
})

test('a real segments document yields word timings', { skip }, async () => {
  const index = normalizeIndex(JSON.parse(readFileSync(join(exportDir, 'index.json'), 'utf8')))
  assert.ok(index)
  const document = normalizeSegmentsDocument(
    JSON.parse(readFileSync(join(exportDir, 'segments', '1', '1.json'), 'utf8')),
    {
      reciterId: 1,
      surahId: 1,
      ayahIdByVerseKey: (key) => {
        const [surahId, ayah] = key.split(':').map(Number)
        return index!.surahs.some((entry) => entry.id === surahId)
          ? buildAyahIdResolver(index!.surahs)(surahId, ayah)
          : undefined
      },
      resolveAyahId: (surahId, ayah) => buildAyahIdResolver(index!.surahs)(surahId, ayah),
    },
  )
  assert.equal(document.variant, 'murattal')
  assert.ok(document.segments.length > 0)
  assert.ok(document.segments.some((segment) => segment.word_index === 0))
  assert.equal(document.segments[0].surah_id, 1)
})

test('the repository consumes the real export end to end', { skip }, async () => {
  const { fetchImpl } = fileFetch(exportDir)
  const content = await ContentRepository.open({
    baseUrl: 'https://example.test/content/',
    fetchImpl,
    databaseName: 'real-export',
  })
  const summary = content.summary()
  assert.equal(summary.mode, 'bundle')
  assert.equal(summary.problem, undefined)
  assert.equal(summary.counts.ayahs, 6236)

  const ayahs = await content.ayahs(1)
  assert.equal(ayahs.length, 7)
  assert.equal(ayahs[0].transliteration, 'Bismi Allahi alrrahmani alrraheemi')
  const words = await content.words(ayahs[0].id)
  assert.equal(words.length, 4)

  const segments = await content.segmentsForAyah(1, ayahs[0])
  assert.ok(segments.length > 0)

  const licenses = await content.licenses()
  assert.ok(licenses.length >= 3)
  assert.ok(licenses.some((license) => license.id === 'cc-by-3.0'))
  assert.ok(licenses.some((license) => license.id === 'tanzil-transliteration-permission'))
  assert.ok(
    content.summary().licenses.length >= 3,
    'summary should expose the loaded licence registry',
  )

  content.close()
})
