'use client'

import { useRouter } from 'next/navigation'
import { buttonClasses } from '@/components/design-system/button'
import { Card, EmptyState, SectionHeading } from '@/components/design-system/card'
import { VerseStateChip, type VerseState } from '@/components/design-system/chips'
import { AppError, AppHeader, AppSplash, PlaceholderBanner, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import type { SurahRow } from '@/lib/content/types'
import type { PresetRow, ProgressRow } from '@/lib/user/types'
import { formatRelativeDay } from '@/lib/utils'
import { parseVerseKey } from '@/lib/verses'

export default function ProgressPage() {
  const app = useApp()
  const router = useRouter()

  const { data, loading } = useAsync(async () => {
    if (!app.content || !app.user) return null
    const [progress, review, sessions, surahs, presets] = await Promise.all([
      app.user.allProgress(),
      app.user.reviewQueue(20),
      app.user.recentSessions(8),
      app.content.surahs(),
      app.user.listPresets(),
    ])
    return {
      progress,
      review,
      sessions,
      surahs: new Map<number, SurahRow>(surahs.map((surah) => [surah.id, surah])),
      presets: new Map<string, PresetRow>(presets.map((preset) => [preset.id, preset])),
    }
  }, [app.ready, app.revision])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app

  const totals = data.progress.reduce(
    (accumulator, row) => ({
      repetitions: accumulator.repetitions + row.repetitions_done,
      verses: accumulator.verses + 1,
      memorized: accumulator.memorized + (row.memorization_state === 'memorized' ? 1 : 0),
    }),
    { repetitions: 0, verses: 0, memorized: 0 },
  )

  const bySurah = new Map<number, ProgressRow[]>()
  for (const row of data.progress) {
    const key = row.verse_key ?? ''
    const { surahId } = parseVerseKey(key)
    const list = bySurah.get(surahId) ?? []
    list.push(row)
    bySurah.set(surahId, list)
  }
  const surahGroups = [...bySurah.entries()].sort((a, b) => a[0] - b[0])

  const practiceQueue: ProgressRow[] = (data.review.length > 0 ? data.review : data.progress).filter(
    (row) => row.verse_key,
  )
  const practiceReview = async () => {
    if (!app.user || practiceQueue.length === 0) return
    const verseNumbers = practiceQueue
      .map((row) => parseVerseKey(row.verse_key ?? '').ayah)
      .filter((ayah) => ayah > 0)
    const surahId = parseVerseKey(practiceQueue[0].verse_key ?? '').surahId
    const surah = data.surahs.get(surahId)
    const from = Math.min(...verseNumbers)
    const to = Math.max(...verseNumbers)
    const existing = (await app.user.listPresets()).find(
      (preset) => preset.surah_id === surahId && preset.from_ayah === from && preset.to_ayah === to,
    )
    const preset =
      existing ??
      (await app.user.createPreset({
        name: `${surah?.name_latin ?? surahId} review`,
        surah_id: surahId,
        from_ayah: from,
        to_ayah: to,
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
      <AppHeader title={t('progress.title')} />
      <PlaceholderBanner />

      <Card className="flex items-start justify-between gap-4">
        <Metric value={totals.repetitions} label={t('progress.totalRepetitions')} />
        <Metric value={totals.verses} label={t('progress.versesTouched')} />
        <Metric value={totals.memorized} label={t('progress.memorized')} />
      </Card>

      {data.progress.length === 0 ? (
        <EmptyState title={t('progress.emptyTitle')} message={t('progress.emptyBody')} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeading title={t('progress.reviewQueue')} />
            {data.review.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('progress.reviewQueueEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {data.review.slice(0, 5).map((row) => (
                  <button
                    key={`${row.preset_id}-${row.ayah}`}
                    type="button"
                    onClick={() => router.push(`/progress/verse/?key=${row.verse_key}`)}
                    className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{row.verse_key}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('progress.lastHeard', { when: formatRelativeDay(row.last_played_at) })}
                    </span>
                  </button>
                ))}
                {practiceQueue.length > 0 ? (
                  <button
                    type="button"
                    className={buttonClasses('primary', 'md', false) + ' self-start'}
                    onClick={() => void practiceReview()}
                  >
                    {t('verseDetail.practice')}
                  </button>
                ) : null}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading title={t('progress.bySurah')} />
            {surahGroups.map(([surahId, rows]) => {
              const surah = data.surahs.get(surahId)
              const repetitions = rows.reduce((total, row) => total + row.repetitions_done, 0)
              return (
                <Card key={surahId} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-foreground">
                      {surah ? `${surah.id} · ${surah.name_latin}` : surahId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('progress.repetitionsDone', { n: repetitions })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rows.map((row) => (
                      <button
                        key={`${row.preset_id}-${row.ayah}`}
                        type="button"
                        onClick={() => router.push(`/progress/verse/?key=${row.verse_key}`)}
                      >
                        <VerseStateChip
                          state={row.memorization_state as VerseState}
                          label={row.verse_key ?? `${row.ayah}`}
                        />
                      </button>
                    ))}
                  </div>
                </Card>
              )
            })}
          </section>
        </>
      )}

      {data.sessions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading title={t('progress.recentSessions')} />
          <Card className="flex flex-col divide-y divide-border">
            {data.sessions.map((session) => {
              const preset = session.preset_id ? data.presets.get(session.preset_id) : undefined
              return (
                <div key={session.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {preset?.name ?? t('common.section')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDay(session.started_at)}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t('progress.repetitionsDone', { n: session.repetitions })} ·{' '}
                    {t('progress.exposures', { n: session.verses_covered })}
                  </span>
                </div>
              )
            })}
          </Card>
        </section>
      ) : null}
    </Screen>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
