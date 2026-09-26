import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAyahIdResolver,
  decodeTable,
  normalizeIndex,
  normalizeSegmentsDocument,
  normalizeSurahDocument,
  resolveTemplate,
} from '../lib/content/bundle'
import type { SurahRow } from '../lib/content/types'

const surah: SurahRow = {
  id: 112,
  name_arabic: 'الإخلاص',
  name_latin: 'Al-Ikhlas',
  name_english: 'The Sincerity',
  verses_count: 4,
  revelation: 'Meccan',
  bismillah_pre: 1,
}

test('decodes the pipeline index columnar tables and derives paths from its files inventory', () => {
  const index = normalizeIndex({
    layout: 'grouped',
    web_bundle_version: 2,
    schema_version: 1,
    bundle_digest: 'sha256:bundle',
    counts: { surahs: 2, ayahs: 7, words: 29, reciters: 1 },
    surahs: {
      columns: [
        'id',
        'name_arabic',
        'name_latin',
        'name_english',
        'verses_count',
        'revelation',
        'bismillah_pre',
        'revelation_order',
        'rukus',
      ],
      rows: [
        [1, 'الفاتحة', 'Al-Faatiha', 'The Opening', 7, 'Meccan', 0, 5, 1],
        [112, 'الإخلاص', 'Al-Ikhlas', 'The Sincerity', 4, 'Meccan', 0, 22, 1],
      ],
    },
    reciters: {
      columns: [
        'id',
        'remote_id',
        'name',
        'style',
        'qirat',
        'source',
        'license_id',
        'license_url',
        'license_evidence_url',
        'attribution',
        'has_segments',
        'enabled',
      ],
      rows: [
        [
          1,
          'quran-align:Alafasy_128kbps',
          'Mishary Rashid Al-Afasy',
          'Murattal',
          "Hafs 'an Asim",
          'quran_align',
          'cc-by-4.0-quran-align',
          'https://creativecommons.org/licenses/by/4.0/',
          'https://github.com/cpfair/quran-align#data',
          'Word timing data: cpfair/quran-align, licensed CC BY 4.0.',
          1,
          1,
        ],
      ],
    },
    licenses_file: 'licenses.json',
    files: [
      { path: 'surahs/1.json', kind: 'surah', bytes: 3033 },
      { path: 'surahs/112.json', kind: 'surah', bytes: 1601 },
      { path: 'segments/1/1.json', kind: 'segments', bytes: 653 },
      { path: 'audio-files.json', kind: 'audio_files', bytes: 136 },
      { path: 'licenses.json', kind: 'licenses', bytes: 5001 },
      { path: 'TANZIL-NOTICE.txt', kind: 'notice', bytes: 1108 },
    ],
  })

  assert.ok(index)
  assert.equal(index?.layout, 'grouped')
  assert.equal(index?.bundle_id, 'sha256:bundle')
  assert.equal(index?.surahs.length, 2)
  assert.equal(index?.surahs[1].name_latin, 'Al-Ikhlas')
  assert.equal(index?.reciters.length, 1)
  assert.equal(index?.reciters[0].remote_id, 'quran-align:Alafasy_128kbps')
  assert.equal(index?.reciters[0].license_id, 'cc-by-4.0-quran-align')
  assert.equal(index?.reciters[0].has_segments, 1)
  // Paths come from the files inventory, without explicit *_path fields.
  assert.equal(index?.surah_path, 'surahs/{surah_id}.json')
  assert.equal(index?.segments_path, 'segments/{reciter_id}/{surah_id}.json')
  assert.equal(index?.licenses_path, 'licenses.json')
  assert.equal(index?.audio_path, 'audio-files.json')
  assert.equal(index?.files.length, 6)
})

test('merges the per-surah transliteration_rows and words tables', () => {
  const document = normalizeSurahDocument(
    {
      surah_id: 1,
      ayahs: {
        columns: [
          'id',
          'surah_id',
          'ayah',
          'verse_key',
          'text_uthmani',
          'transliteration',
          'juz',
          'hizb',
          'page',
          'sajdah',
          'sajdah_type',
        ],
        rows: [
          [
            1,
            1,
            1,
            '1:1',
            'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
            'Bismi Allahi alrrahmani alrraheemi',
            1,
            1,
            1,
            0,
            null,
          ],
        ],
      },
      transliteration_rows: {
        columns: ['transliteration_id', 'ayah_id', 'text'],
        rows: [[1, 1, 'Bismi Allahi alrrahmani alrraheemi']],
      },
      words: {
        columns: ['id', 'ayah_id', 'position', 'text_uthmani', 'transliteration', 'translation'],
        rows: [
          [1, 1, 1, 'بِسْمِ', 'Bismi', null],
          [2, 1, 2, 'ٱللَّهِ', 'Allahi', null],
          [3, 1, 3, 'ٱلرَّحْمَٰنِ', 'alrrahmani', null],
          [4, 1, 4, 'ٱلرَّحِيمِ', 'alrraheemi', null],
        ],
      },
    },
    { ...surah, id: 1, verses_count: 7 },
    buildAyahIdResolver([{ ...surah, id: 1, verses_count: 7 }]),
  )

  assert.equal(document.ayahs.length, 1)
  assert.equal(document.ayahs[0].transliteration, 'Bismi Allahi alrrahmani alrraheemi')
  assert.equal(document.words.length, 4)
  assert.deepEqual(
    document.words.map((word) => word.position),
    [1, 2, 3, 4],
  )
  assert.equal(document.words[0].text_uthmani, 'بِسْمِ')
})

test('normalizes the grouped boot index and rejects the legacy bulk layout', () => {
  const index = normalizeIndex({
    web_bundle_version: 2,
    schema_version: 1,
    pipeline_version: '0.5.0',
    generated_by: { pipeline_version: 'ignored-when-explicit' },
    bundle_id: 'bundle:abc',
    counts: { surahs: 1, ayahs: 4 },
    surahs: [
      {
        id: 112,
        nameArabic: 'الإخلاص',
        nameLatin: 'Al-Ikhlas',
        nameEnglish: 'The Sincerity',
        verses: 4,
        revelation: 'Meccan',
      },
    ],
    reciters: [
      { id: 7, remote_id: 'rec-7', name: 'Reciter Seven', style: 'Murattal', has_segments: true, enabled: false },
    ],
    licenses: { licenses: [{ id: 'cc-by-4.0', name: 'CC BY 4.0', evidence_urls: ['https://example.org/e'] }] },
    attribution: { attributions: [{ text: 'Attribution line' }] },
  })

  assert.ok(index)
  assert.equal(index?.bundle_id, 'bundle:abc')
  assert.equal(index?.schema_version, 1)
  assert.equal(index?.pipeline_version, '0.5.0')
  assert.equal(index?.surahs[0].name_latin, 'Al-Ikhlas')
  assert.equal(index?.surahs[0].verses_count, 4)
  assert.equal(index?.reciters[0].enabled, 0)
  assert.equal(index?.reciters[0].has_segments, 1)
  assert.equal(index?.licenses[0].evidence_url, 'https://example.org/e')
  assert.deepEqual(index?.attribution, ['Attribution line'])
  assert.equal(index?.surah_path, 'surahs/{surah_id}.json')
  assert.equal(index?.segments_path, 'segments/{reciter_id}/{surah_id}.json')

  // The legacy bulk export (files inventory, no inline tables) is not grouped.
  assert.equal(
    normalizeIndex({
      web_bundle_version: 1,
      files: [{ path: 'surahs.json', kind: 'surahs' }],
      counts: { surahs: 114 },
    }),
    null,
  )
})

test('normalizes a surah document, joining inline words when needed', () => {
  const document = normalizeSurahDocument(
    {
      surah_id: 112,
      ayahs: [
        {
          ayah: 1,
          verse_key: '112:1',
          text_uthmani: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ',
          words: [
            { position: 1, transliteration: 'Qul' },
            { position: 2, transliteration: 'huwallahu' },
            { position: 3, transliteration: 'ahad' },
          ],
        },
        { ayah: 2, text_uthmani: 'ٱللَّهُ ٱلصَّمَدُ', transliteration: 'Allahus-samad' },
      ],
    },
    surah,
    buildAyahIdResolver([surah]),
  )

  assert.equal(document.ayahs.length, 2)
  assert.equal(document.ayahs[0].verse_key, '112:1')
  assert.ok((document.ayahs[0].id ?? 0) > 0)
  assert.equal(document.ayahs[0].transliteration, 'Qul huwallahu ahad')
  assert.equal(document.words.length, 3)
  assert.equal(document.words[0].position, 1)
  assert.equal(document.ayahs[1].transliteration, 'Allahus-samad')
})

test('normalizes a bare-array surah document', () => {
  const document = normalizeSurahDocument(
    [{ number: 3, text: 'لم يلد', transliteration: 'Lam yalid' }],
    surah,
    buildAyahIdResolver([surah]),
  )
  assert.equal(document.ayahs.length, 1)
  assert.equal(document.ayahs[0].ayah, 3)
  assert.equal(document.ayahs[0].verse_key, '112:3')
  assert.equal(document.ayahs[0].text_uthmani, 'لم يلد')
})

test('normalizes grouped and flat segment documents', () => {
  const options = {
    reciterId: 4,
    surahId: 112,
    ayahIdByVerseKey: (key: string) => {
      const [s, a] = key.split(':').map(Number)
      return s === 112 ? 6236 - 4 + a : undefined
    },
    resolveAyahId: (s: number, a: number) => (s === 112 ? 6236 - 4 + a : 0),
  }

  const grouped = normalizeSegmentsDocument(
    {
      reciter_id: 4,
      variant: 'murattal',
      ayahs: [
        {
          verse_key: '112:1',
          segments: [
            { word_index: 0, start_ms: 0, end_ms: 4000 },
            { index: 1, start_ms: 200, end_ms: 1200 },
          ],
        },
      ],
    },
    options,
  )
  assert.equal(grouped.variant, 'murattal')
  assert.equal(grouped.segments.length, 2)
  assert.equal(grouped.segments[1].word_index, 1)
  assert.equal(grouped.segments[1].surah_id, 112)
  assert.equal(grouped.segments[1].ayah_id, 6233)

  const flat = normalizeSegmentsDocument(
    {
      reciter_id: 4,
      segments: [{ ayah_id: 6233, word_index: 1, start_ms: 10, end_ms: 90 }],
    },
    options,
  )
  assert.equal(flat.segments.length, 1)
  assert.equal(flat.segments[0].start_ms, 10)

  const columnar = normalizeSegmentsDocument(
    {
      reciter_id: 4,
      columns: ['ayah_id', 'word_index', 'start_ms', 'end_ms'],
      rows: [[6233, 1, 10, 90]],
    },
    options,
  )
  assert.equal(columnar.segments.length, 1)
})

test('decodes columnar tables and resolves path templates', () => {
  const decoded = decodeTable({
    reciter_id: 9,
    variant: 'murattal',
    columns: ['ayah_id', 'word_index'],
    rows: [[1, 0]],
  })
  assert.deepEqual(decoded, [{ ayah_id: 1, word_index: 0, reciter_id: 9, variant: 'murattal' }])

  assert.equal(
    resolveTemplate('segments/{reciter_id}/{surah_id}.json', { reciter_id: 1, surah_id: 55 }),
    'segments/1/55.json',
  )
  assert.equal(resolveTemplate('surahs/{surah_id}.json', {}), 'surahs/{surah_id}.json')
})
