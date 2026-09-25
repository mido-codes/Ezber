import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBundle } from '../lib/content/bundle'
import type { ContentBundleManifest } from '../lib/content/types'

const manifest: ContentBundleManifest = {
  schema: 'ezber-content-web/test',
  schema_version: 1,
  pipeline_version: '0.0-test',
  bundle_id: 'test-bundle',
  counts: { surahs: 2, ayahs: 3 },
  licenses: [{ id: 'tanzil-quran-text', name: 'Tanzil' }],
  attribution: ['Quran text from the Tanzil Project.'],
}

test('normalizes a bundle that uses schema field names', () => {
  const bundle = normalizeBundle(manifest, {
    surahs: [
      {
        id: 1,
        name_arabic: 'الفاتحة',
        name_latin: 'Al-Fatihah',
        name_english: 'The Opening',
        verses_count: 2,
        revelation: 'Meccan',
        bismillah_pre: 1,
      },
      {
        id: 2,
        name_arabic: 'البقرة',
        name_latin: 'Al-Baqarah',
        name_english: 'The Cow',
        verses_count: 1,
        revelation: 'Medinan',
        bismillah_pre: 1,
      },
    ],
    ayahs: [
      { id: 1, surah_id: 1, ayah: 1, verse_key: '1:1', text_uthmani: 'بسم الله', transliteration: 'Bismillah' },
      { id: 2, surah_id: 1, ayah: 2, verse_key: '1:2', text_uthmani: 'الحمد', transliteration: 'Al-hamdu' },
      { id: 3, surah_id: 2, ayah: 1, verse_key: '2:1', text_uthmani: 'الم', transliteration: 'Alif-Lam-Mim' },
    ],
    reciters: [
      {
        id: 7,
        remote_id: 'candidate-1',
        name: 'Candidate One',
        style: 'Murattal',
        source: 'test',
        license_id: 'cc-by-4.0',
        license_url: 'https://example.org/license',
        license_evidence_url: 'https://example.org/evidence',
        attribution: 'Test reciter',
        has_segments: 1,
        enabled: 0,
      },
    ],
    segments: [{ reciter_id: 7, variant: 'murattal', ayah_id: 1, word_index: 1, start_ms: 100, end_ms: 900 }],
    audio_files: [
      {
        id: 1,
        reciter_id: 7,
        kind: 'ayah',
        surah_id: 1,
        ayah: 1,
        variant: 'murattal',
        url: 'https://example.org/audio/1.mp3',
        duration_ms: 4200,
      },
    ],
  })

  assert.equal(bundle.surahs.length, 2)
  assert.equal(bundle.ayahs.length, 3)
  assert.deepEqual(
    bundle.ayahs.map((ayah) => ayah.verse_key),
    ['1:1', '1:2', '2:1'],
  )
  assert.equal(bundle.ayahs[0].transliteration, 'Bismillah')
  assert.equal(bundle.reciters[0].id, 7)
  assert.equal(bundle.reciters[0].enabled, 0)
  assert.equal(bundle.segments[0].start_ms, 100)
  assert.equal(bundle.audio_files[0].duration_ms, 4200)
  assert.equal(bundle.licenses[0].id, 'tanzil-quran-text')
  assert.equal(bundle.attribution.length, 1)
})

test('accepts alias fields and inline word lists', () => {
  const bundle = normalizeBundle(manifest, {
    surahs: [{ id: 55, nameArabic: 'الرحمن', nameLatin: 'Ar-Rahman', nameEnglish: 'The Beneficent', verses: 2 }],
    verses: [
      {
        surah: 55,
        number: 1,
        arabic: 'الرحمن',
        words: ['Ar-Rahman'],
      },
      {
        surah: 55,
        number: 2,
        text: 'علم',
        transliteration: "'Allama",
      },
    ],
  })

  assert.equal(bundle.surahs[0].name_latin, 'Ar-Rahman')
  assert.equal(bundle.surahs[0].verses_count, 2)
  assert.equal(bundle.ayahs.length, 2)
  assert.equal(bundle.ayahs[0].verse_key, '55:1')
  // Transliteration is joined from the inline word tokens.
  assert.equal(bundle.ayahs[0].transliteration, 'Ar-Rahman')
  assert.equal(bundle.words.length, 1)
  assert.equal(bundle.words[0].position, 1)
  assert.equal(bundle.ayahs[1].transliteration, "'Allama")
})

test('accepts verse_key-split files and transliteration rows', () => {
  const bundle = normalizeBundle(manifest, {
    chapters: [
      {
        id: 112,
        name_latin: 'Al-Ikhlas',
        name_english: 'The Sincerity',
        verses_count: 2,
        ayahs: [
          { ayah: 1, text_uthmani: 'قل هو الله أحد' },
          { ayah: 2, text_uthmani: 'الله الصمد' },
        ],
      },
    ],
    transliteration_rows: [
      { surah_id: 112, ayah: 1, text: 'Qul huwallahu ahad' },
      { surah_id: 112, ayah: 2, text: 'Allahus-samad' },
    ],
  })

  assert.equal(bundle.ayahs.length, 2)
  assert.equal(bundle.ayahs[0].transliteration, 'Qul huwallahu ahad')
  assert.equal(bundle.ayahs[1].verse_key, '112:2')
})

test('drops unknown reciter audio and tolerates missing tables', () => {
  const bundle = normalizeBundle(manifest, {
    surahs: [{ id: 1, name_latin: 'Al-Fatihah', name_english: 'The Opening', verses_count: 1 }],
    ayahs: [{ surah_id: 1, ayah: 1, text_uthmani: 'بسم الله الرحمن الرحيم', transliteration: 'Bismillah' }],
    audio_files: [{ reciter_id: 999, kind: 'chapter', chapter: 1, url: 'https://example.org/x.mp3' }],
  })

  assert.equal(bundle.audio_files.length, 0)
  assert.equal(bundle.reciters.length, 0)
  assert.equal(bundle.segments.length, 0)
  assert.equal(bundle.ayahs[0].id, 1)
})
