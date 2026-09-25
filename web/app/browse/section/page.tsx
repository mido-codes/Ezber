'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buttonClasses } from '@/components/design-system/button'
import { Card } from '@/components/design-system/card'
import { MetaChip } from '@/components/design-system/chips'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import { estimateDurationMs, totalRepetitions } from '@/lib/player/queue'
import { formatMinutes } from '@/lib/utils'
import { clampRange, formatRange } from '@/lib/verses'

function SectionPicker() {
  const app = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const surahId = Number(params?.get('surah') ?? 1)
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)

  const { data, loading } = useAsync(async () => {
    if (!app.content) return null
    const surah = await app.content.surah(surahId)
    if (!surah) return null
    const ayahs = await app.content.ayahs(surahId)
    return { surah, ayahs }
  }, [app.ready, surahId])

  useEffect(() => {
    if (!data || range) return
    setRange(clampRange({ start: 1, end: 5 }, data.surah.verses_count))
  }, [data, range])

  const repeats = Number(app.setting('defaults.repeat_count', '5')) || 5
  const estimate = useMemo(() => {
    if (!data || !range) return 0
    const selected = data.ayahs.filter((ayah) => ayah.ayah >= range.start && ayah.ayah <= range.end)
    const count = totalRepetitions(
      {
        surah_id: surahId,
        from_ayah: range.start,
        to_ayah: range.end,
        repeat_count: repeats,
      },
      {},
      selected,
    )
    return estimateDurationMs(count, selected)
  }, [data, range, repeats, surahId])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data || !range) return <AppSplash message={app.startupMessage} />
  const { t } = app
  const { surah, ayahs } = data

  const setEnd = (ayah: number) => {
    setRange((current) => (current ? { start: current.start, end: Math.max(current.start, ayah) } : { start: ayah, end: ayah }))
  }

  const quick = [
    { label: `1–${Math.min(5, surah.verses_count)}`, start: 1, end: Math.min(5, surah.verses_count) },
    { label: `1–${Math.min(13, surah.verses_count)}`, start: 1, end: Math.min(13, surah.verses_count) },
    { label: t('section.wholeSurah'), start: 1, end: surah.verses_count },
  ]

  return (
    <Screen>
      <AppHeader title={surah.name_latin} eyebrow={t('section.title')} back />
      <p className="text-sm text-muted-foreground">{t('section.hint')}</p>

      <div className="flex flex-wrap gap-2">
        {quick.map((entry) => (
          <button
            key={entry.label}
            type="button"
            onClick={() => setRange({ start: entry.start, end: entry.end })}
          >
            <MetaChip active={range.start === entry.start && range.end === entry.end}>
              {entry.label}
            </MetaChip>
          </button>
        ))}
      </div>

      <Card className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">{surah.name_latin}</span>
          <span className="text-xs text-muted-foreground">
            {surah.revelation} · {surah.verses_count} {t('common.verses')}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {t('section.selected', { n: range.end - range.start + 1 })}
        </span>
      </Card>

      <div className="flex flex-col gap-2">
        {ayahs.map((ayah) => {
          const inRange = ayah.ayah >= range.start && ayah.ayah <= range.end
          const isEdge = ayah.ayah === range.start || ayah.ayah === range.end
          return (
            <button
              key={ayah.id}
              type="button"
              onClick={() => setEnd(ayah.ayah)}
              className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
                inRange ? 'border-primary/40 bg-secondary' : 'border-border bg-card'
              }`}
            >
              <span className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isEdge ? 'text-primary' : 'text-foreground'}`}>
                  {ayah.verse_key}
                </span>
                <span className="font-arabic text-xl text-foreground">{ayah.text_uthmani}</span>
              </span>
              <span className="line-clamp-2 font-serif text-sm leading-snug text-muted-foreground">
                {ayah.transliteration}
              </span>
            </button>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-2xl px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="rounded-3xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
          <button
            type="button"
            className={buttonClasses('primary', 'lg', true)}
            onClick={() => router.push(`/builder/?surah=${surahId}&from=${range.start}&to=${range.end}&range=${formatRange(range.start, range.end)}`)}
          >
            {t('section.continue')}
            <span className="text-sm font-normal opacity-80">
              {t('section.estimate', { min: formatMinutes(estimate), repeats })}
            </span>
          </button>
        </div>
      </div>
    </Screen>
  )
}

export default function SectionPickerPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <SectionPicker />
    </Suspense>
  )
}
