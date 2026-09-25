'use client'

import { Play } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { Card, SectionHeading } from '@/components/design-system/card'
import { VerseStateChip, type VerseState } from '@/components/design-system/chips'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import { formatRelativeDay } from '@/lib/utils'
import { parseVerseKey } from '@/lib/verses'

function VerseDetail() {
  const app = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const verseKeyValue = params?.get('key') ?? ''
  const [version, setVersion] = useState(0)
  const [noteDraft, setNoteDraft] = useState('')

  const { data, loading } = useAsync(async () => {
    if (!app.content || !app.user || !verseKeyValue) return null
    const { surahId } = parseVerseKey(verseKeyValue)
    const [ayah, surah, progress, ratings, notes] = await Promise.all([
      app.content.ayah(verseKeyValue),
      app.content.surah(surahId),
      app.user.progressForVerse(verseKeyValue),
      app.user.ratingsForVerse(verseKeyValue),
      app.user.notesForVerse(verseKeyValue),
    ])
    return { ayah, surah, progress, ratings, notes }
  }, [app.ready, verseKeyValue, version, app.revision])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app
  const { ayah, surah, progress, ratings, notes } = data
  const repetitions = progress.reduce((total, row) => total + row.repetitions_done, 0)
  const solid = ratings.filter((rating) => rating.rating === 'solid').length
  const shaky = ratings.filter((rating) => rating.rating === 'shaky').length
  const state: VerseState = progress[0]?.memorization_state ?? 'new'

  const practice = async () => {
    if (!app.user || !ayah) return
    const existing = (await app.user.listPresets()).find(
      (preset) =>
        preset.surah_id === ayah.surah_id &&
        preset.from_ayah === ayah.ayah &&
        preset.to_ayah === ayah.ayah,
    )
    const preset =
      existing ??
      (await app.user.createPreset({
        name: `${surah?.name_latin ?? ayah.surah_id} ${ayah.ayah}`,
        surah_id: ayah.surah_id,
        from_ayah: ayah.ayah,
        to_ayah: ayah.ayah,
        repeat_count: Number(app.setting('defaults.repeat_count', '5')) || 5,
        reciter_id: Number(app.setting('defaults.reciter_id')) || 1,
        show_arabic: app.setting('defaults.show_arabic', '0') === '1' ? 1 : 0,
        show_transliteration: app.setting('defaults.show_transliteration', '1') !== '0' ? 1 : 0,
        pause_between_repeat_ms: Number(app.setting('defaults.pause_between_repeat_ms', '500')) || 0,
        section_repeats: 1,
      }))
    await app.user.touchPreset(preset.id)
    await app.setSetting('ui.last_preset_id', preset.id)
    app.refresh()
    router.push(`/player/?id=${preset.id}`)
  }

  return (
    <Screen>
      <AppHeader title={t('verseDetail.title', { key: verseKeyValue })} back />

      <Card className="flex flex-col gap-4">
        {ayah ? (
          <>
            <p className="font-arabic text-right text-foreground">{ayah.text_uthmani}</p>
            <p className="font-serif text-xl leading-snug text-foreground">{ayah.transliteration}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{surah?.name_latin ?? ''}</span>
          <VerseStateChip state={state} label={t(`common.${state}`)} />
        </div>
        <button type="button" className={buttonClasses('primary', 'md', true)} onClick={() => void practice()}>
          <Play className="size-4" aria-hidden />
          {t('verseDetail.playFromHere')}
        </button>
      </Card>

      <Card className="flex flex-col gap-2">
        <SectionHeading title={t('verseDetail.ratings')} />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('progress.repetitionsDone', { n: repetitions })}</span>
          <span className="text-muted-foreground">
            {solid} {t('common.solid')} · {shaky} {t('common.shaky')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('progress.stateBecause', { solid, shaky })}
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading title={t('verseDetail.notes')} />
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('notes.emptyBody')}</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="rounded-2xl bg-muted px-3 py-2">
              <p className="text-sm leading-relaxed text-foreground">{note.body_md}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRelativeDay(note.updated_at ?? note.created_at)}
              </p>
            </div>
          ))
        )}
        <textarea
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder={t('notes.bodyPlaceholder', { key: verseKeyValue })}
          rows={2}
          className="w-full resize-none rounded-2xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <button
          type="button"
          className={buttonClasses('outline', 'sm', false) + ' self-start'}
          disabled={!noteDraft.trim()}
          onClick={async () => {
            if (!app.user || !noteDraft.trim()) return
            await app.user.saveNote({ verse_key: verseKeyValue, body_md: noteDraft.trim() })
            setNoteDraft('')
            setVersion((value) => value + 1)
            app.refresh()
          }}
        >
          {t('verseDetail.addNote')}
        </button>
      </Card>
    </Screen>
  )
}

export default function VerseDetailPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <VerseDetail />
    </Suspense>
  )
}
