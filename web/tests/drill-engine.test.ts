import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DrillEngine } from '../lib/player/drill-engine'
import type { DrillAudioResolver } from '../lib/player/audio'
import type { ReciterRow } from '../lib/content/types'
import type { DrillItem } from '../lib/player/queue'

/** Minimal HTMLAudioElement stand-in for the engine's playback loop. */
class FakeAudio {
  src = ''
  currentTime = 0
  preload = ''
  paused = true
  playbackRate = 1
  private listeners = new Map<string, (() => void)[]>()

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener()
  }

  async play(): Promise<void> {
    this.paused = false
    this.emit('play')
  }

  pause(): void {
    this.paused = true
    this.emit('pause')
  }

  finish(): void {
    this.paused = true
    this.emit('ended')
  }
}

const fakeAudios: FakeAudio[] = []
class TrackingAudio extends FakeAudio {
  constructor() {
    super()
    fakeAudios.push(this)
  }
}

// The engine talks to globals only; stub them for the test process.
;(globalThis as unknown as { Audio: unknown }).Audio = TrackingAudio
;(globalThis as unknown as { window: unknown }).window = globalThis

const reciter: ReciterRow = {
  id: 1,
  remote_id: 'test',
  name: 'Test Reciter',
  style: 'Murattal',
  qirat: null,
  source: 'test',
  license_id: 'test',
  license_url: '',
  license_evidence_url: '',
  attribution: '',
  has_segments: 0,
  enabled: 1,
}

const resolver: DrillAudioResolver = {
  async resolve() {
    return { url: 'stub://audio', durationMs: 1000, segments: [], source: 'placeholder' as const }
  },
}

function item(ayahNumber: number, repeatIndex: number, repeatCount: number): DrillItem {
  return {
    ayah: {
      id: ayahNumber,
      surah_id: 55,
      ayah: ayahNumber,
      verse_key: `55:${ayahNumber}`,
      text_uthmani: 'كلمة',
      transliteration: 'kalimah',
    },
    repeat_index: repeatIndex,
    repeat_count: repeatCount,
  }
}

const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

test('walks a queue, records every repeat boundary and finishes the section', async () => {
  const completed: number[] = []
  const finished: { repetitions: number; passes: number }[] = []
  const engine = new DrillEngine({
    queue: [item(1, 1, 2), item(1, 2, 2), item(2, 1, 1)],
    resolver,
    reciter,
    sectionRepeats: 2,
    pauseBetweenRepeatsMs: 0,
    nowPlaying: { presetName: 'Test', surahName: 'Ar-Rahman', reciterName: reciter.name },
    callbacks: {
      onState: () => {},
      onItemComplete: (_item, globalIndex) => completed.push(globalIndex),
      onCompleted: (stats) => finished.push({ repetitions: stats.repetitions, passes: stats.passes }),
    },
  })

  await engine.prepare(false)
  assert.equal(engine.state.status, 'paused')
  assert.equal(engine.state.globalIndex, 0)

  await engine.play()
  assert.equal(engine.state.status, 'playing')

  const audio = fakeAudios.at(-1)!
  audio.finish()
  await flush()
  assert.deepEqual(completed, [0])
  assert.equal(engine.state.index, 1)
  assert.equal(engine.state.globalIndex, 1)

  audio.finish()
  await flush()
  assert.deepEqual(completed, [0, 1])
  assert.equal(engine.state.index, 2)

  audio.finish()
  await flush()
  // Pass 1 done; the engine automatically starts pass 2.
  assert.deepEqual(completed, [0, 1, 2])
  assert.equal(engine.state.pass, 2)
  assert.equal(engine.state.index, 0)

  audio.finish()
  await flush()
  audio.finish()
  await flush()
  audio.finish()
  await flush()

  assert.equal(engine.state.status, 'completed')
  assert.deepEqual(completed, [0, 1, 2, 3, 4, 5])
  assert.equal(finished.length, 1)
  assert.equal(finished[0].passes, 2)
  assert.equal(finished[0].repetitions, 6)
})

test('manual transport moves by verse and repeat', async () => {
  const engine = new DrillEngine({
    queue: [item(1, 1, 2), item(1, 2, 2), item(2, 1, 2), item(2, 2, 2)],
    resolver,
    reciter,
    sectionRepeats: 1,
    pauseBetweenRepeatsMs: 0,
    nowPlaying: { presetName: 'Test', surahName: 'Ar-Rahman', reciterName: reciter.name },
    callbacks: { onState: () => {} },
  })
  await engine.prepare(false)

  engine.nextVerse()
  await flush()
  assert.equal(engine.state.item?.ayah.ayah, 2)
  assert.equal(engine.state.index, 2)

  engine.previousVerse()
  await flush()
  assert.equal(engine.state.item?.ayah.ayah, 1)
  assert.equal(engine.state.index, 0)

  engine.nextRepeat()
  await flush()
  assert.equal(engine.state.index, 1)

  engine.previousRepeat()
  await flush()
  assert.equal(engine.state.index, 0)
})

test('respects a loop-until-stopped section plan', async () => {
  const engine = new DrillEngine({
    queue: [item(1, 1, 1)],
    resolver,
    reciter,
    sectionRepeats: 0,
    pauseBetweenRepeatsMs: 0,
    nowPlaying: { presetName: 'Test', surahName: 'Ar-Rahman', reciterName: reciter.name },
    callbacks: { onState: () => {} },
  })
  await engine.prepare(false)
  await engine.play()
  const audio = fakeAudios.at(-1)!
  audio.finish()
  await flush()
  audio.finish()
  await flush()

  assert.equal(engine.state.status, 'playing')
  assert.equal(engine.state.pass, 3)
  engine.stop()
})
