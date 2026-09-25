import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDrillQueue, estimateDurationMs, repeatCountFor, resumePointFor, totalRepetitions } from '../lib/player/queue'
import type { AyahRow } from '../lib/content/types'

function ayah(surah: number, number: number): AyahRow {
  return {
    id: surah * 1000 + number,
    surah_id: surah,
    ayah: number,
    verse_key: `${surah}:${number}`,
    text_uthmani: 'كلمة كلمة',
    transliteration: 'kalimah kalimah',
  }
}

test('builds the verse × repetition queue for the section', () => {
  const preset = { surah_id: 55, from_ayah: 1, to_ayah: 3, repeat_count: 3 }
  const ayahs = [ayah(55, 1), ayah(55, 2), ayah(55, 3), ayah(55, 4)]
  const queue = buildDrillQueue(preset, {}, ayahs)

  assert.equal(queue.length, 9)
  assert.deepEqual(
    queue.map((item) => `${item.ayah.ayah}.${item.repeat_index}`),
    ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3'],
  )
  assert.equal(totalRepetitions(preset, {}, ayahs), 9)
})

test('applies per-verse overrides and ignores ayahs outside the range', () => {
  const preset = { surah_id: 55, from_ayah: 1, to_ayah: 3, repeat_count: 2 }
  const ayahs = [ayah(55, 1), ayah(55, 2), ayah(55, 3)]
  const queue = buildDrillQueue(preset, { 2: 5 }, ayahs)

  assert.equal(queue.length, 9)
  assert.equal(repeatCountFor(preset, { 2: 5 }, 2), 5)
  assert.equal(repeatCountFor(preset, { 2: 5 }, 3), 2)
  assert.equal(queue.filter((item) => item.ayah.ayah === 2).length, 5)
})

test('estimates a duration from the repetition plan', () => {
  const preset = { surah_id: 55, from_ayah: 1, to_ayah: 3, repeat_count: 5 }
  const ayahs = [ayah(55, 1), ayah(55, 2), ayah(55, 3)]
  const estimate = estimateDurationMs(totalRepetitions(preset, {}, ayahs), ayahs)
  assert.ok(estimate > 0)
  assert.ok(estimate < 60 * 60_000)
})

test('maps a plan index to a verse and repeat without content', () => {
  const preset = { from_ayah: 1, to_ayah: 3, repeat_count: 5 }
  assert.deepEqual(
    pick(resumePointFor(preset, {}, 0)),
    { verse: 1, repeat: 1, repeatTotal: 5 },
  )
  assert.deepEqual(
    pick(resumePointFor(preset, {}, 7)),
    { verse: 2, repeat: 3, repeatTotal: 5 },
  )
  // Per-verse overrides shift the mapping.
  assert.deepEqual(
    pick(resumePointFor(preset, { 1: 2 }, 2)),
    { verse: 2, repeat: 1, repeatTotal: 5 },
  )
  // Past the end of a pass, the index wraps to the next pass.
  assert.deepEqual(
    pick(resumePointFor(preset, {}, 15)),
    { verse: 1, repeat: 1, repeatTotal: 5 },
  )
})

function pick(point: ReturnType<typeof resumePointFor>) {
  return { verse: point.verse, repeat: point.repeat, repeatTotal: point.repeatTotal }
}
