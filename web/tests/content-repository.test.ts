import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { ContentRepository } from '../lib/content/repository'

test('seeds placeholder content and serves surahs, ayahs and word timings', async () => {
  const content = await ContentRepository.open({ offline: true })
  const summary = content.summary()
  assert.equal(summary.mode, 'placeholder')
  assert.equal(summary.counts.surahs, 114)

  const surahs = await content.surahs()
  assert.equal(surahs.length, 114)
  assert.equal(surahs[54].name_latin, 'Ar-Rahman')

  const ayahs = await content.ayahs(55)
  assert.equal(ayahs.length, 78)
  assert.equal(ayahs[0].verse_key, '55:1')
  assert.equal(ayahs[0].text_uthmani, 'ٱلرَّحْمَٰنُ')

  const ayah = await content.ayah('55:3')
  assert.ok(ayah)
  assert.equal(ayah?.ayah, 3)

  const words = await content.words(ayah!.id)
  assert.ok(words.length >= 1)
  assert.equal(words[0].position, 1)

  const longerAyah = await content.ayah('55:5')
  const longerWords = await content.words(longerAyah!.id)
  assert.ok(longerWords.length >= 3)

  const segments = await content.segments(1, ayah!.id)
  assert.ok(segments.length >= 2)
  assert.equal(segments[0].word_index, 0)

  const reciters = await content.reciters()
  assert.equal(reciters.length, 3)
  assert.equal(reciters[0].license_id, 'placeholder')

  const bundleAyah = await content.ayah('112:1')
  assert.equal(bundleAyah?.text_uthmani, 'قُلْ هُوَ ٱللَّهُ أَحَدٌ')

  content.close()
})

test('generates placeholder ayahs for a surah before they are cached', async () => {
  const content = await ContentRepository.open({ offline: true })
  const ayahs = await content.ayahs(114)
  assert.equal(ayahs.length, 6)
  assert.equal(ayahs[5].verse_key, '114:6')
  assert.ok(ayahs[5].transliteration.length > 0)
  content.close()
})
