import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { fixtureFetch, fixtureIndex, indexFetch, notFoundFetch } from './helpers/fixture'
import { ContentRepository } from '../lib/content/repository'

const BASE = 'https://example.test/content/'
// The fixture is generated from the real pipeline export; its identity is the
// real index's bundle_digest.
const FIXTURE_BUNDLE_ID = fixtureIndex().bundle_digest

test('boot loads only the small index and never the bulk tables', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-boot',
  })

  const summary = content.summary()
  assert.equal(summary.mode, 'bundle')
  assert.equal(summary.source, 'network')
  assert.equal(summary.bundle_id, FIXTURE_BUNDLE_ID)
  assert.equal(summary.problem, undefined)

  // Exactly one request: /content/index.json.
  assert.equal(log.urls.length, 1)
  assert.ok(log.urls[0].endsWith('/content/index.json'))

  const surahs = await content.surahs()
  assert.equal(surahs.length, 114)
  // Tanzil's own transliteration spelling, straight from the real export.
  assert.equal(surahs[54].name_latin, 'Ar-Rahmaan')
  // The real export ships the quran-align timing reciters.
  const reciters = await content.reciters()
  assert.equal(reciters.length, 11)
  assert.equal(reciters[0].source, 'quran_align')

  // Reading the index added no network traffic.
  assert.equal(log.urls.length, 1)
  content.close()
})

test('opening a surah fetches just that surah and exposes its words', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-surah',
  })
  const before = log.urls.length

  const ayahs = await content.ayahs(1)
  assert.equal(log.urls.length, before + 1)
  assert.ok(log.urls.at(-1)?.endsWith('/content/surahs/1.json'))
  assert.equal(ayahs.length, 7)
  assert.equal(ayahs[0].text_uthmani, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')
  assert.equal(ayahs[0].transliteration, 'Bismi Allahi alrrahmani alrraheemi')

  // The pipeline's top-level words table must be decoded into the words store.
  const words = await content.words(ayahs[0].id)
  assert.equal(words.length, 4)
  assert.equal(words[0].position, 1)
  assert.equal(words[0].text_uthmani, 'بِسْمِ')
  const allWords = await Promise.all(ayahs.map((ayah) => content.words(ayah.id)))
  assert.equal(
    allWords.reduce((total, rows) => total + rows.length, 0),
    29,
  )

  // Second read is served from memory.
  await content.ayahs(1)
  assert.equal(log.urls.length, before + 1)
  content.close()
})

test('the whole surah, not just the words, comes from the real export', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-surah-55',
  })
  const before = log.urls.length
  const ayahs = await content.ayahs(55)
  assert.equal(log.urls.length, before + 1)
  assert.ok(log.urls.at(-1)?.endsWith('/content/surahs/55.json'))
  assert.equal(ayahs.length, 78)
  assert.ok(ayahs[0].transliteration.length > 0)
  content.close()
})

test('cached surahs and words are served from IndexedDB when offline', async () => {
  const { fetchImpl } = fixtureFetch()
  const writer = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-offline',
  })
  const written = await writer.ayahs(1)
  writer.close()

  const offline = await ContentRepository.open({
    baseUrl: BASE,
    offline: true,
    databaseName: 'lazy-offline',
  })
  const summary = offline.summary()
  assert.equal(summary.source, 'cache')
  assert.ok(summary.cached_surahs >= 1)

  const ayahs = await offline.ayahs(1)
  assert.equal(ayahs.length, 7)
  assert.equal((await offline.words(ayahs[0].id)).length, 4)
  assert.equal(written[0].transliteration, 'Bismi Allahi alrrahmani alrraheemi')
  offline.close()
})

test('word timings load lazily per reciter and surah, and 404s cache empty', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-segments',
  })
  const ayahs = await content.ayahs(1)
  const before = log.urls.length

  const segments = await content.segmentsForAyah(1, ayahs[0])
  assert.equal(log.urls.length, before + 1)
  assert.ok(log.urls.at(-1)?.endsWith('/content/segments/1/1.json'))
  assert.equal(segments[0].variant, 'murattal')
  assert.equal(segments[0].word_index, 0)
  assert.ok(segments.some((segment) => segment.word_index === 1))

  // Memory cache: no second fetch for the same reciter/surah.
  await content.segmentsForAyah(1, ayahs[1])
  assert.equal(log.urls.length, before + 1)

  // The fixture ships timings for reciters 1 and 2 only.
  const secondReciter = await content.segmentsForSurah(2, 1)
  assert.ok(secondReciter.length > 0)
  assert.ok(log.urls.at(-1)?.endsWith('/content/segments/2/1.json'))

  const beforeMissing = log.urls.length
  const missing = await content.segmentsForSurah(3, 1)
  assert.equal(missing.length, 0)
  assert.equal(log.urls.length, beforeMissing + 1)
  await content.segmentsForSurah(3, 1)
  assert.equal(log.urls.length, beforeMissing + 1)

  content.close()
})

test('the real licence registry loads lazily and fills the summary', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-licences',
  })
  assert.equal(content.summary().licenses.length, 0)

  const before = log.urls.length
  const licenses = await content.licenses()
  assert.equal(log.urls.length, before + 1)
  assert.ok(log.urls.at(-1)?.endsWith('/content/licenses.json'))
  assert.deepEqual(
    licenses.map((license) => license.id),
    ['cc-by-3.0', 'cc-by-4.0-quran-align', 'tanzil-transliteration-permission'],
  )
  assert.ok(content.summary().licenses.length >= 3)
  assert.ok(content.summary().attribution.some((line) => line.includes('Tanzil Project')))

  // Cached for a second call.
  await content.licenses()
  assert.equal(log.urls.length, before + 1)
  content.close()
})

test('a partial bundle falls back to placeholder readings per surah', async () => {
  const { fetchImpl } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-partial',
  })
  assert.equal(content.isPlaceholderSurah(2), false)

  const ayahs = await content.ayahs(2)
  assert.equal(ayahs.length, 286)
  assert.equal(content.isPlaceholderSurah(2), true)

  const segments = await content.segmentsForSurah(1, 2)
  assert.ok(segments.length > 0)
  content.close()
})

test('a bundle_digest change refetches the affected surah without touching others', async () => {
  const { fetchImpl } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-bundle-change',
  })
  await content.ayahs(1)
  await content.segmentsForSurah(1, 1)
  content.close()

  // Same bundle: cached surah and timings are reused.
  const sameLog = fixtureFetch()
  const same = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: sameLog.fetchImpl,
    databaseName: 'lazy-bundle-change',
  })
  const sameBefore = sameLog.log.urls.length
  await same.ayahs(1)
  await same.segmentsForSurah(1, 1)
  assert.equal(sameLog.log.urls.length, sameBefore)
  same.close()

  // New bundle: the requested surah and its timings are fetched again.
  const changed = fixtureFetch(undefined, (pathname, body) => {
    if (pathname.endsWith('/index.json')) {
      return { ...(body as Record<string, unknown>), bundle_digest: 'fixture:changed' }
    }
    if (pathname.endsWith('/surahs/1.json')) {
      const document = body as { ayahs: { rows: unknown[][] } }
      document.ayahs.rows[0][5] = 'Bismillah (new revision)'
      return document
    }
    return body
  })
  const before = changed.log.urls.length
  const fresh = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: changed.fetchImpl,
    databaseName: 'lazy-bundle-change',
  })
  const freshAyahs = await fresh.ayahs(1)
  assert.equal(fresh.summary().bundle_id, 'fixture:changed')
  assert.equal(freshAyahs[0].transliteration, 'Bismillah (new revision)')
  assert.ok(changed.log.urls.length > before)
  await fresh.segmentsForSurah(1, 1)
  assert.ok(changed.log.urls.at(-1)?.endsWith('/content/segments/1/1.json'))
  fresh.close()
})

test('clearing the content cache forces a refetch and keeps the index', async () => {
  const { fetchImpl, log } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-clear',
  })
  await content.ayahs(1)
  await content.clearContentCache()
  assert.equal(content.summary().cached_surahs, 0)

  const before = log.urls.length
  const ayahs = await content.ayahs(1)
  assert.equal(ayahs.length, 7)
  assert.equal(log.urls.length, before + 1)
  assert.ok(log.urls.at(-1)?.endsWith('/content/surahs/1.json'))
  content.close()
})

test('placeholder mode works with no content export at all', async () => {
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: notFoundFetch(),
    databaseName: 'lazy-placeholder',
  })
  assert.equal(content.summary().mode, 'placeholder')
  assert.equal(content.summary().source, 'placeholder')
  assert.equal(content.summary().problem?.kind, 'http')
  assert.equal(content.summary().problem?.status, 404)

  const surahs = await content.surahs()
  assert.equal(surahs.length, 114)
  const ayahs = await content.ayahs(112)
  assert.equal(ayahs.length, 4)
  assert.equal(ayahs[0].text_uthmani, 'قُلْ هُوَ ٱللَّهُ أَحَدٌ')
  const segments = await content.segmentsForSurah(1, 112)
  assert.ok(segments.length > 0)
  content.close()
})

test('an unusable export is recorded, never silently replaced', async () => {
  // 200 but not the grouped layout.
  const unsupported = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: indexFetch(200, { files: [{ path: 'surahs.json', kind: 'surahs' }] }),
    databaseName: 'lazy-unsupported',
  })
  assert.equal(unsupported.summary().mode, 'placeholder')
  assert.equal(unsupported.summary().problem?.kind, 'unsupported')
  unsupported.close()

  // Server error.
  const failing = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: indexFetch(500, { error: 'boom' }),
    databaseName: 'lazy-http-error',
  })
  assert.equal(failing.summary().problem?.kind, 'http')
  assert.equal(failing.summary().problem?.status, 500)
  failing.close()

  // Malformed JSON.
  const malformed = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl: indexFetch(200, '{ not json'),
    databaseName: 'lazy-malformed',
  })
  assert.equal(malformed.summary().problem?.kind, 'parse')
  malformed.close()
})

test('exposes cache stats for the settings screen', async () => {
  const { fetchImpl } = fixtureFetch()
  const content = await ContentRepository.open({
    baseUrl: BASE,
    fetchImpl,
    databaseName: 'lazy-stats',
  })
  await content.ayahs(112)
  await content.segmentsForSurah(1, 112)
  const stats = await content.cacheStats()
  assert.equal(stats.surahs.length, 1)
  assert.equal(stats.segment_sets.length, 1)
  assert.equal(stats.ayah_rows, 4)
  assert.equal(stats.word_rows, 15)
  assert.ok(stats.segment_rows >= 1)
  content.close()
})
