'use client'

import { BookOpen, Mic2, Play, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { Card, EmptyState, SectionHeading } from '@/components/design-system/card'
import { AccentChip } from '@/components/design-system/chips'
import { PresetCard } from '@/components/design-system/preset-card'
import { Meter } from '@/components/design-system/meter'
import { resumePointFor } from '@/lib/player/queue'
import { AppError, AppHeader, AppSplash, PlaceholderBanner, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import type { SurahRow } from '@/lib/content/types'
import type { PresetRow, ProgressRow, SessionRow } from '@/lib/user/types'
import { formatRelativeDay } from '@/lib/utils'

interface HomeData {
  lastPreset: PresetRow | null
  lastSurah: SurahRow | null
  resume: { verse: number; repeat: number; verseTotal: number; repeatTotal: number }
  ratio: number
  totals: { repetitions: number; verses: number; memorized: number }
  week: { days: boolean[]; verses: number }
  presets: PresetRow[]
  surahs: Map<number, SurahRow>
  review: ProgressRow[]
}

export default function HomePage() {
  const app = useApp()
  const router = useRouter()
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    if (!app.ready || !app.user || !app.content) return
    let cancelled = false
    const user = app.user
    const content = app.content
    ;(async () => {
      const surahList = await content.surahs()
      const surahs = new Map(surahList.map((surah) => [surah.id, surah]))
      const presets = await user.listPresets()
      const lastId = await user.getSetting('ui.last_preset_id')
      const lastPreset = presets.find((preset) => preset.id === lastId) ?? presets[0] ?? null

      const allProgress = await user.allProgress()
      const progressTotals = allProgress.reduce(
        (totals, row) => ({
          repetitions: totals.repetitions + row.repetitions_done,
          verses: totals.verses + 1,
          memorized: totals.memorized + (row.memorization_state === 'memorized' ? 1 : 0),
        }),
        { repetitions: 0, verses: 0, memorized: 0 },
      )

      const sessions = await user.recentSessions(50)
      const week: boolean[] = Array.from({ length: 7 }).map((_, index) => {
        const day = new Date(Date.now() - (6 - index) * 86_400_000).toISOString().slice(0, 10)
        return sessions.some((session: SessionRow) => session.started_at.slice(0, 10) === day)
      })
      const weekVerses = sessions
        .filter((session) => new Date(session.started_at).getTime() >= Date.now() - 7 * 86_400_000)
        .reduce((total, session) => total + session.verses_covered, 0)

      let resume = { verse: 1, repeat: 1, verseTotal: 5, repeatTotal: 5 }
      let ratio = 0
      if (lastPreset) {
        const session = await user.activeSession(lastPreset.id)
        const planState = await user.planState(lastPreset.id)
        const overrides = await user.presetOverrides(lastPreset.id)
        const verseTotal = lastPreset.to_ayah - lastPreset.from_ayah + 1
        // Resume without touching content: the plan index plus the preset's
        // repeat counts are enough to show verse/repeat on the card.
        const point = resumePointFor(lastPreset, overrides, planState?.plan_index ?? 0)
        resume = {
          verse: point.verse,
          repeat: point.repeat,
          verseTotal,
          repeatTotal: point.repeatTotal,
        }
        const totalRepetitions =
          lastPreset.section_repeats === 0
            ? Math.max(point.totalInPass, (session?.repetitions ?? 0) + point.totalInPass)
            : point.totalInPass * Math.max(1, lastPreset.section_repeats)
        const done = session?.repetitions ?? 0
        ratio =
          done > 0
            ? Math.min(1, done / Math.max(1, totalRepetitions))
            : point.indexInPass > 0
              ? 0.05
              : 0
      }

      const review = await user.reviewQueue(4)
      if (!cancelled) {
        setData({
          lastPreset,
          lastSurah: lastPreset ? surahs.get(lastPreset.surah_id) ?? null : null,
          resume,
          ratio,
          totals: progressTotals,
          week: { days: week, verses: weekVerses },
          presets,
          surahs,
          review,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [app.ready, app.revision, app.user, app.content])

  useEffect(() => {
    if (app.ready && app.setting('onboarding.completed', '1') === '0') {
      router.replace('/welcome/')
    }
  }, [app.ready, app.revision, app.setting, router])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || !app.user || !app.content) return <AppSplash message={app.startupMessage} />
  if (!data) return <AppSplash message={app.startupMessage} />

  const { t } = app

  const continueDrill = async () => {
    if (!data.lastPreset) return
    await app.user?.touchPreset(data.lastPreset.id)
    await app.setSetting('ui.last_preset_id', data.lastPreset.id)
    router.push(`/player/?id=${data.lastPreset.id}`)
  }

  return (
    <Screen>
      <AppHeader
        title={t('app.name')}
        actions={
          <Link href="/browse/" aria-label={t('home.newDrill')} className={buttonClasses('outline', 'sm')}>
            <Plus className="size-4" aria-hidden />
            {t('home.newDrill')}
          </Link>
        }
      />
      <PlaceholderBanner />

      {data.lastPreset ? (
        <Card className="flex flex-col gap-4">
          <SectionHeading
            eyebrow={t('common.continue')}
            title={data.lastPreset.name}
            description={
              data.lastSurah
                ? `${data.lastSurah.name_latin} ${data.lastPreset.from_ayah}–${data.lastPreset.to_ayah}`
                : undefined
            }
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <AccentChip>
              {t('player.verseOf', {
                n: Math.max(1, data.resume.verse - data.lastPreset.from_ayah + 1),
                total: data.resume.verseTotal,
              })}
            </AccentChip>
            <span>
              {t('player.repeatOf', { n: data.resume.repeat, total: data.resume.repeatTotal })}
            </span>
          </div>
          {data.ratio > 0 ? <Meter value={data.ratio} /> : null}
          <button
            type="button"
            onClick={() => void continueDrill()}
            className={buttonClasses('primary', 'lg', true)}
          >
            <Play className="size-5" aria-hidden />
            {t('common.continueDrill')}
          </button>
        </Card>
      ) : (
        <EmptyState
          icon={<BookOpen className="size-10" aria-hidden />}
          title={t('home.startTitle')}
          message={t('home.startBody')}
          action={
            <Link href="/browse/" className={buttonClasses('primary', 'lg')}>
              {t('home.chooseSurah')}
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/browse/" className={buttonClasses('outline', 'md', true) + ' h-full flex-col py-5'}>
          <Plus className="size-5 text-primary" aria-hidden />
          {t('home.newDrill')}
        </Link>
        <Link href="/reciters/" className={buttonClasses('outline', 'md', true) + ' h-full flex-col py-5'}>
          <Mic2 className="size-5 text-primary" aria-hidden />
          {t('home.reciters')}
        </Link>
      </div>

      <Card className="flex flex-col gap-3">
        <p className="text-sm font-medium text-foreground">{t('home.progressGlance')}</p>
        <div className="flex items-start justify-between gap-4">
          <Metric value={data.totals.repetitions} label={t('home.repetitions')} />
          <Metric value={data.totals.verses} label={t('home.versesTouched')} />
          <Metric value={data.totals.memorized} label={t('home.memorized')} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">{t('home.thisWeek')}</span>
          <span className="text-xs text-muted-foreground">
            {t('home.versesDrilled', { n: data.week.verses })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {data.week.days.map((active, index) => (
            <span
              key={index}
              className={`h-2 flex-1 rounded-full ${active ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
        {data.week.days.every((active) => !active) ? (
          <p className="text-xs text-muted-foreground">{t('home.noSessions')}</p>
        ) : null}
      </Card>

      {data.presets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">{t('home.recentPresets')}</h2>
            <Link href="/presets/" className="text-sm font-medium text-primary">
              {t('presets.title')}
            </Link>
          </div>
          {data.presets.slice(0, 3).map((preset) => {
            const surah = data.surahs.get(preset.surah_id)
            return (
              <PresetCard
                key={preset.id}
                name={preset.name}
                meta={`${surah?.name_latin ?? preset.surah_id} ${preset.from_ayah}–${preset.to_ayah} · ×${preset.repeat_count}`}
                status={preset.last_used_at ? t('presets.lastUsed', { when: formatRelativeDay(preset.last_used_at) }) : t('presets.neverUsed')}
                href={`/builder/?id=${preset.id}`}
                playLabel={t('common.start')}
                onPlay={async () => {
                  await app.user?.touchPreset(preset.id)
                  await app.setSetting('ui.last_preset_id', preset.id)
                  router.push(`/player/?id=${preset.id}`)
                }}
              />
            )
          })}
        </section>
      ) : null}

      {data.review.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">{t('home.worthRevisiting')}</h2>
            <p className="text-xs text-muted-foreground">{t('home.worthRevisitingBody')}</p>
          </div>
          {data.review.map((row) => {
            const key = row.verse_key ?? `${row.preset_id}:${row.ayah}`
            const [surahId] = key.split(':')
            const surah = data.surahs.get(Number(surahId))
            return (
              <Link
                key={`${row.preset_id}-${row.ayah}`}
                href={`/progress/verse/?key=${key}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">
                  {surah ? `${surah.name_latin} ` : ''}
                  {key}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('progress.lastHeard', { when: formatRelativeDay(row.last_played_at) })}
                </span>
              </Link>
            )
          })}
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
