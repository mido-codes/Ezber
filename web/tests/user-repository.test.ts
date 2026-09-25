import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { UserRepository } from '../lib/user/repository'

test('user data follows the schema and survives export/import', async () => {
  const user = await UserRepository.open()

  // First-run demo data (mirrors the iOS seed).
  await user.seedDemoData(2)
  const presets = await user.listPresets()
  assert.equal(presets.length, 3)
  const rahman = presets.find((preset) => preset.name === 'Ar-Rahman 1–5')
  assert.ok(rahman)
  assert.equal(rahman?.repeat_count, 5)
  assert.equal(rahman?.section_repeats, 1)

  const overrides = await user.presetOverrides(rahman!.id)
  assert.equal(overrides[5], 8)

  const planState = await user.planState(rahman!.id)
  assert.ok(planState)
  assert.equal(planState?.plan_index, 7)

  const notes = await user.listNotes()
  assert.equal(notes.length, 2)
  const search = await user.searchNotes('madd')
  assert.equal(search.length, 1)

  // Repetition boundaries accumulate progress.
  await user.recordRepeat(rahman!.id, 1, '55:1')
  await user.recordRepeat(rahman!.id, 1, '55:1')
  const progress = await user.progressForVerse('55:1')
  assert.equal(progress[0].repetitions_done, 14)

  // Ratings drive the memorization state.
  await user.rateVerse('55:9', 'solid')
  await user.rateVerse('55:9', 'solid')
  let verseRows = await user.progressForVerse('55:9')
  assert.equal(verseRows.length, 0)
  await user.recordRepeat(rahman!.id, 9, '55:9')
  verseRows = await user.progressForVerse('55:9')
  assert.equal(verseRows[0].memorization_state, 'learning')
  await user.rateVerse('55:9', 'solid')
  verseRows = await user.progressForVerse('55:9')
  assert.equal(verseRows[0].memorization_state, 'review')
  await user.rateVerse('55:9', 'solid')
  await user.rateVerse('55:9', 'solid')
  await user.rateVerse('55:9', 'solid')
  verseRows = await user.progressForVerse('55:9')
  assert.equal(verseRows[0].memorization_state, 'memorized')
  await user.rateVerse('55:9', 'shaky')
  verseRows = await user.progressForVerse('55:9')
  assert.equal(verseRows[0].memorization_state, 'learning')

  // Preset CRUD.
  const created = await user.createPreset({
    name: 'Test drill',
    surah_id: 112,
    from_ayah: 1,
    to_ayah: 4,
    repeat_count: 3,
    reciter_id: 2,
    show_arabic: 0,
    show_transliteration: 1,
    pause_between_repeat_ms: 500,
    section_repeats: 0,
  })
  assert.equal(created.section_repeats, 0)
  const duplicated = await user.duplicatePreset(created.id)
  assert.equal(duplicated?.name, 'Test drill (copy)')
  await user.deletePreset(created.id)
  assert.equal(await user.getPreset(created.id), undefined)

  // Sessions and plan state.
  const session = await user.startSession(rahman!.id)
  assert.ok(session.id !== undefined)
  await user.updateSession(session.id!, { repetitions: 4, verses_covered: 2 })
  const active = await user.activeSession(rahman!.id)
  assert.equal(active?.repetitions, 4)
  await user.updateSession(session.id!, { ended_at: new Date().toISOString() })
  const recent = await user.recentSessions()
  assert.ok(recent.some((row) => row.id === session.id))

  // Settings round-trip.
  await user.setSetting('language', 'tr')
  assert.equal(await user.getSetting('language'), 'tr')

  // Export/import round-trip.
  const exported = await user.exportUserData()
  assert.equal(exported.format, 'ezber-user/1')
  assert.ok(exported.presets.length >= 3)
  await user.resetUserData()
  assert.equal((await user.listPresets()).length, 0)
  await user.importUserData(exported)
  const restored = await user.listPresets()
  assert.equal(restored.length, exported.presets.length)
  const restoredNotes = await user.listNotes()
  assert.equal(restoredNotes.length, exported.notes.length)
  assert.equal(await user.getSetting('language'), 'tr')

  user.close()
})
