import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { ContentRepository } from '../lib/content/repository'

/**
 * End-to-end import of a bundle shaped exactly like the content pipeline's
 * web export (columnar {columns, rows} documents, an index with a files array,
 * per-reciter segment files and a licences document) through a stubbed fetch.
 */
const index = {
  web_bundle_version: 1,
  generated_by: { name: 'ezber-content-pipeline', pipeline_version: '0.4.0-test' },
  content_mode: 'offline-redistributable',
  schema_version: 1,
  logical_digest: 'digest:abc',
  counts: { surahs: 1, ayahs: 2, words: 2, reciters: 1, audio_files: 1, segments: 2 },
  meta: { content_mode: 'offline-redistributable' },
  licenses_file: 'licenses.json',
  files: [
    { path: 'surahs.json', kind: 'surahs', sha256: 'sha256:1', bytes: 10, rows: 1 },
    { path: 'ayahs.json', kind: 'ayahs', sha256: 'sha256:2', bytes: 10, rows: 2 },
    { path: 'words.json', kind: 'words', sha256: 'sha256:3', bytes: 10, rows: 2 },
    { path: 'reciters.json', kind: 'reciters', sha256: 'sha256:4', bytes: 10, rows: 1 },
    { path: 'audio-files.json', kind: 'audio_files', sha256: 'sha256:5', bytes: 10, rows: 1 },
    { path: 'segments/4.json', kind: 'segments', sha256: 'sha256:6', bytes: 10, rows: 2 },
    { path: 'transliterations.json', kind: 'transliterations', sha256: 'sha256:7', bytes: 10, rows: 1 },
    { path: 'translations.json', kind: 'translations', sha256: 'sha256:8', bytes: 10, rows: 0 },
    { path: 'licenses.json', kind: 'licenses', sha256: 'sha256:9', bytes: 10, rows: 2 },
    { path: 'TANZIL-NOTICE.txt', kind: 'notice', sha256: 'sha256:a', bytes: 10 },
  ],
  bundle_digest: 'digest:bundle-1',
}

const files: Record<string, unknown> = {
  '/content/index.json': index,
  '/content/surahs.json': {
    columns: ['id', 'name_arabic', 'name_latin', 'name_english', 'verses_count', 'revelation', 'bismillah_pre', 'revelation_order', 'rukus'],
    rows: [[1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 2, 'Meccan', 1, 5, 1]],
  },
  '/content/ayahs.json': {
    columns: ['id', 'surah_id', 'ayah', 'verse_key', 'text_uthmani', 'transliteration', 'juz', 'hizb', 'page', 'sajdah', 'sajdah_type'],
    rows: [
      [1, 1, 1, '1:1', 'بِسْمِ ٱللَّهِ', 'Bismillah', 1, 1, 1, 0, null],
      [2, 1, 2, '1:2', 'ٱلْحَمْدُ لِلَّهِ', 'Al-hamdu lillah', 1, 1, 1, 0, null],
    ],
  },
  '/content/words.json': {
    columns: ['id', 'ayah_id', 'position', 'text_uthmani', 'transliteration', 'translation'],
    rows: [
      [1, 1, 1, 'بِسْمِ', 'Bismillah', null],
      [2, 2, 1, 'ٱلْحَمْدُ', 'Al-hamdu', null],
    ],
  },
  '/content/reciters.json': {
    columns: ['id', 'remote_id', 'name', 'style', 'qirat', 'source', 'license_id', 'license_url', 'license_evidence_url', 'attribution', 'has_segments', 'enabled'],
    rows: [[4, 'rec-4', 'Test Reciter', 'Murattal', "Hafs 'an Asim", 'test', 'cc-by-4.0', 'https://example.org/l', 'https://example.org/e', 'Test attribution', 1, 1]],
  },
  '/content/audio-files.json': {
    columns: ['id', 'reciter_id', 'kind', 'surah_id', 'ayah', 'chapter', 'variant', 'url', 'bytes', 'bitrate', 'duration_ms', 'checksum'],
    rows: [[1, 4, 'ayah', 1, 1, null, 'murattal', 'https://audio.example.org/1-1.mp3', 1000, 128, 3500, 'sha1:abc']],
  },
  '/content/segments/4.json': {
    reciter_id: 4,
    variant: 'murattal',
    columns: ['ayah_id', 'word_index', 'start_ms', 'end_ms'],
    rows: [
      [1, 0, 0, 3500],
      [1, 1, 200, 3100],
    ],
  },
  '/content/transliterations.json': {
    columns: ['id', 'resource_id', 'name', 'author', 'language', 'source', 'license_id', 'license_url', 'license_evidence_url', 'attribution'],
    rows: [[1, 'tanzil.en.transliteration', 'Transliteration', 'Tanzil', 'en', 'tanzil', 'tanzil-transliteration-permission', 'https://tanzil.net/trans/', 'https://tanzil.net/trans/en.transliteration', 'Tanzil transliteration under written grant']],
  },
  '/content/translations.json': { columns: ['id', 'resource_id', 'name'], rows: [] },
  '/content/licenses.json': {
    licenses: [
      { id: 'cc-by-3.0', name: 'Creative Commons Attribution 3.0', url: 'https://creativecommons.org/licenses/by/3.0/', evidence_urls: ['https://tanzil.net/docs/Text_License'], attribution: 'Quran text from the Tanzil Project.' },
      { id: 'tanzil-transliteration-permission', name: 'Tanzil transliteration written permission', url: 'https://tanzil.net/trans/' },
    ],
    attributions: [
      { license_id: 'cc-by-3.0', text: 'Quran text from the Tanzil Project.', source_kind: 'asset', source_id: 'quran-text' },
      { license_id: 'tanzil-transliteration-permission', text: 'English transliteration used under a written grant.', source_kind: 'transliteration', source_id: 'tanzil.en.transliteration' },
    ],
    notices: [{ path: 'TANZIL-NOTICE.txt', kind: 'notice' }],
  },
  '/content/TANZIL-NOTICE.txt': 'Tanzil copyright notice',
}

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const pathname = new URL(url, 'http://localhost').pathname
  if (pathname === '/TANZIL-NOTICE.txt' || pathname === '/content/TANZIL-NOTICE.txt') {
    return new Response('Tanzil copyright notice', { status: 200 })
  }
  const body = files[pathname]
  if (body === undefined) return new Response('not found', { status: 404 })
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}) as typeof fetch

test('imports the pipeline web export layout into IndexedDB', async () => {
  const content = await ContentRepository.open({ baseUrl: 'http://localhost/content/' })
  const summary = content.summary()
  assert.equal(summary.mode, 'bundle')
  assert.equal(summary.bundle_id, 'digest:bundle-1')
  assert.equal(summary.pipeline_version, '0.4.0-test')
  assert.equal(summary.counts.ayahs, 2)
  assert.equal(summary.counts.segments, 2)

  const surahs = await content.surahs()
  assert.equal(surahs.length, 1)
  assert.equal(surahs[0].name_latin, 'Al-Fatihah')
  assert.equal(surahs[0].revelation_order, 5)

  const ayahs = await content.ayahs(1)
  assert.equal(ayahs.length, 2)
  assert.equal(ayahs[0].transliteration, 'Bismillah')
  assert.equal(ayahs[1].verse_key, '1:2')

  const words = await content.words(1)
  assert.equal(words.length, 1)
  assert.equal(words[0].position, 1)

  const reciters = await content.reciters()
  assert.equal(reciters[0].id, 4)
  assert.equal(reciters[0].license_id, 'cc-by-4.0')

  const audio = await content.audioFiles(4, 1)
  assert.equal(audio[0].url, 'https://audio.example.org/1-1.mp3')
  assert.equal(audio[0].duration_ms, 3500)

  // Segments inherit reciter_id and variant from the per-reciter file header.
  const segments = await content.segments(4, 1, 'murattal')
  assert.equal(segments.length, 2)
  assert.equal(segments[1].word_index, 1)
  assert.equal(segments[1].end_ms, 3100)

  const licenses = await content.licenses()
  assert.equal(licenses.length, 2)
  assert.equal(licenses[0].evidence_url, 'https://tanzil.net/docs/Text_License')

  // Attribution strings come from the licences document.
  assert.ok(summary.attribution.includes('English transliteration used under a written grant.'))

  content.close()
})
