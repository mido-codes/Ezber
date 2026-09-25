'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buttonClasses } from '@/components/design-system/button'
import { Card, SectionHeading } from '@/components/design-system/card'
import { SegmentedChoice, Stepper, ToggleRow } from '@/components/design-system/controls'
import { ErrorBlock, LoadingBlock } from '@/components/layout/async-state'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import { estimateDurationMs, totalRepetitions } from '@/lib/player/queue'
import type { PresetRow } from '@/lib/user/types'
import { clampRange, formatRange } from '@/lib/verses'
import { formatMinutes, nowIso } from '@/lib/utils'

interface Draft {
  name: string
  surahId: number
  from: number
  to: number
  repeats: number
  overrides: Record<number, number>
  sectionRepeats: number
  pauseMs: number
  reciterId: number
  showArabic: boolean
  showTransliteration: boolean
}

function BuilderInner() {
  const app = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const editId = params?.get('id') ?? null
  const surahParam = Number(params?.get('surah') ?? 0)
  const fromParam = Number(params?.get('from') ?? 0)
  const toParam = Number(params?.get('to') ?? 0)

  const { data, loading, error: dataError, reload: reloadData } = useAsync(async () => {
    if (!app.content || !app.user) return null
    const surahs = await app.content.surahs()
    const reciters = await app.content.reciters()
    let preset: PresetRow | null = null
    let overrides: Record<number, number> = {}
    if (editId) {
      preset = (await app.user.getPreset(editId)) ?? null
      if (preset) overrides = await app.user.presetOverrides(preset.id)
    }
    return { surahs, reciters, preset, overrides }
  }, [app.ready, editId])

  const [draft, setDraft] = useState<Draft | null>(null)
  const [showOverrides, setShowOverrides] = useState(false)
  const initialized = useRef(false)

  // Re-initialise when the route asks for a different preset or range.
  useEffect(() => {
    initialized.current = false
    setDraft(null)
  }, [editId, surahParam, fromParam, toParam])

  useEffect(() => {
    if (!data || initialized.current) return
    initialized.current = true
    if (data.preset) {
      setDraft({
        name: data.preset.name,
        surahId: data.preset.surah_id,
        from: data.preset.from_ayah,
        to: data.preset.to_ayah,
        repeats: data.preset.repeat_count,
        overrides: data.overrides,
        sectionRepeats: data.preset.section_repeats,
        pauseMs: data.preset.pause_between_repeat_ms,
        reciterId: data.preset.reciter_id,
        showArabic: data.preset.show_arabic === 1,
        showTransliteration: data.preset.show_transliteration === 1,
      })
      return
    }
    const surahId = surahParam > 0 ? surahParam : 1
    const surah = data.surahs.find((entry) => entry.id === surahId) ?? data.surahs[0]
    const range = clampRange(
      fromParam > 0 && toParam > 0 ? { start: fromParam, end: toParam } : { start: 1, end: 5 },
      surah?.verses_count ?? 7,
    )
    const defaultReciter = Number(app.setting('defaults.reciter_id')) || data.reciters[0]?.id || 1
    setDraft({
      name: '',
      surahId: surah?.id ?? 1,
      from: range.start,
      to: range.end,
      repeats: Number(app.setting('defaults.repeat_count', '5')) || 5,
      overrides: {},
      sectionRepeats: Number(app.setting('defaults.section_repeats', '1')),
      pauseMs: Number(app.setting('defaults.pause_between_repeat_ms', '500')),
      reciterId: defaultReciter,
      showArabic: app.setting('defaults.show_arabic', '0') === '1',
      showTransliteration: app.setting('defaults.show_transliteration', '1') !== '0',
    })
  }, [data, surahParam, fromParam, toParam, app, editId])

  const surah = data?.surahs.find((entry) => entry.id === draft?.surahId) ?? null
  const {
    data: ayahs,
    loading: ayahsLoading,
    error: ayahsError,
    reload: reloadAyahs,
  } = useAsync(async () => {
    if (!app.content || !draft) return []
    return app.content.ayahs(draft.surahId)
  }, [app.ready, draft?.surahId])

  const selectedAyahs = useMemo(() => {
    if (!ayahs || !draft) return []
    return ayahs.filter((ayah) => ayah.ayah >= draft.from && ayah.ayah <= draft.to)
  }, [ayahs, draft])

  const repetitionTotal = useMemo(() => {
    if (!draft) return 0
    return totalRepetitions(
      {
        surah_id: draft.surahId,
        from_ayah: draft.from,
        to_ayah: draft.to,
        repeat_count: draft.repeats,
      },
      draft.overrides,
      selectedAyahs,
    )
  }, [draft, selectedAyahs])

  const estimateMs = estimateDurationMs(repetitionTotal, selectedAyahs)

  if (app.error) return <AppError message={app.error} />
  if (!app.ready) return <AppSplash message={app.startupMessage} />
  if (!loading && !data) {
    return (
      <Screen>
        <AppHeader title={app.t('builder.titleNew')} back />
        <ErrorBlock
          message={
            dataError === 'offline'
              ? app.t('player.offline')
              : (dataError ?? app.t('player.loadFailed'))
          }
          onRetry={reloadData}
        />
      </Screen>
    )
  }
  if (loading || !data || !draft) return <AppSplash message={app.startupMessage} />
  const { t } = app
  const editing = Boolean(data.preset)

  const setOverride = (ayah: number, value: number) => {
    setDraft((current) => {
      if (!current) return current
      const next = { ...current.overrides }
      if (value === current.repeats) delete next[ayah]
      else next[ayah] = value
      return { ...current, overrides: next }
    })
  }

  const save = async (start: boolean) => {
    if (!app.user || !surah) return
    const name = draft.name.trim() || `${surah.name_latin} ${formatRange(draft.from, draft.to)}`
    let presetId: string
    if (data.preset) {
      const updated: PresetRow = {
        ...data.preset,
        name,
        surah_id: draft.surahId,
        from_ayah: draft.from,
        to_ayah: draft.to,
        repeat_count: draft.repeats,
        reciter_id: draft.reciterId,
        show_arabic: draft.showArabic ? 1 : 0,
        show_transliteration: draft.showTransliteration ? 1 : 0,
        show_translation: 0,
        pause_between_repeat_ms: draft.pauseMs,
        section_repeats: draft.sectionRepeats,
        updated_at: nowIso(),
      }
      await app.user.savePreset(updated, draft.overrides)
      presetId = updated.id
    } else {
      const created = await app.user.createPreset(
        {
          name,
          surah_id: draft.surahId,
          from_ayah: draft.from,
          to_ayah: draft.to,
          repeat_count: draft.repeats,
          reciter_id: draft.reciterId,
          show_arabic: draft.showArabic ? 1 : 0,
          show_transliteration: draft.showTransliteration ? 1 : 0,
          pause_between_repeat_ms: draft.pauseMs,
          section_repeats: draft.sectionRepeats,
        },
        draft.overrides,
      )
      presetId = created.id
    }
    await app.user.touchPreset(presetId)
    await app.setSetting('ui.last_preset_id', presetId)
    app.refresh()
    router.push(start ? `/player/?id=${presetId}` : '/presets/')
  }

  const overrideEntries: [number, number][] = Object.entries(draft.overrides).map(([ayah, count]) => [
    Number(ayah),
    count,
  ])

  return (
    <Screen>
      <AppHeader title={editing ? t('builder.titleEdit') : t('builder.titleNew')} back />

      <Card className="flex flex-col gap-4">
        <SectionHeading
          title={surah?.name_latin ?? ''}
          description={
            surah ? `${surah.name_english} · ${surah.verses_count} ${t('common.verses')}` : undefined
          }
        />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {surah ? `${formatRange(draft.from, draft.to)} · ${draft.to - draft.from + 1} ${t('common.verses')}` : ''}
          </span>
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => router.push(`/browse/section/?surah=${draft.surahId}`)}
          >
            {t('builder.change')}
          </button>
        </div>
        <input
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder={t('builder.namePlaceholder')}
          className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{t('builder.repeatsEveryVerse')}</span>
          <Stepper
            label={t('builder.repeatsEveryVerse')}
            value={draft.repeats}
            onChange={(value) => setDraft({ ...draft, repeats: value })}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t('builder.sectionRepeats')}</p>
            <p className="text-xs text-muted-foreground">{t('builder.sectionRepeatsHint')}</p>
          </div>
          {draft.sectionRepeats === 0 ? (
            <button
              type="button"
              className="text-sm font-semibold text-primary"
              onClick={() => setDraft({ ...draft, sectionRepeats: 1 })}
            >
              {t('common.infinite')}
            </button>
          ) : (
            <Stepper
              label={t('builder.sectionRepeats')}
              value={draft.sectionRepeats}
              onChange={(value) => setDraft({ ...draft, sectionRepeats: value })}
            />
          )}
        </div>
        <ToggleRow
          label={t('builder.loopForever')}
          checked={draft.sectionRepeats === 0}
          onChange={(checked) => setDraft({ ...draft, sectionRepeats: checked ? 0 : 1 })}
        />
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-foreground">{t('builder.pauseBetween')}</span>
          <SegmentedChoice
            label={t('builder.pauseBetween')}
            value={draft.pauseMs}
            onChange={(value) => setDraft({ ...draft, pauseMs: value })}
            options={[
              { value: 0, label: '0s' },
              { value: 500, label: '0.5s' },
              { value: 1000, label: '1s' },
              { value: 2000, label: '2s' },
            ]}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <button
          type="button"
          className="flex items-center justify-between"
          onClick={() => setShowOverrides((value) => !value)}
        >
          <span className="text-sm font-medium text-foreground">{t('builder.perVerse')}</span>
          <span className="text-xs text-muted-foreground">
            {overrideEntries.length > 0
              ? t('builder.overrides', { n: overrideEntries.length })
              : t('builder.useDefault')}
          </span>
        </button>
        {showOverrides ? (
          ayahsLoading ? (
            <LoadingBlock message={t('player.loadingSurah')} />
          ) : ayahsError ? (
            <ErrorBlock
              message={ayahsError === 'offline' ? t('player.offline') : t('player.loadFailed')}
              onRetry={reloadAyahs}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {selectedAyahs.map((ayah) => (
                <div key={ayah.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground">{ayah.verse_key}</span>
                  <div className="flex items-center gap-2">
                    {draft.overrides[ayah.ayah] ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setOverride(ayah.ayah, draft.repeats)}
                      >
                        {t('builder.useDefault')}
                      </button>
                    ) : null}
                    <Stepper
                      label={`${ayah.verse_key}`}
                      value={draft.overrides[ayah.ayah] ?? draft.repeats}
                      onChange={(value) => setOverride(ayah.ayah, value)}
                    />
                  </div>
                </div>
              ))}
              {overrideEntries.length > 0 ? (
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground underline"
                  onClick={() => setDraft({ ...draft, overrides: {} })}
                >
                  {t('builder.resetOverrides')}
                </button>
              ) : null}
            </div>
          )
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-sm font-medium text-foreground">{t('builder.reciter')}</span>
        <div className="flex flex-col gap-2">
          {data.reciters.map((reciter) => {
            const active = reciter.id === draft.reciterId
            return (
              <button
                key={reciter.id}
                type="button"
                onClick={() => setDraft({ ...draft, reciterId: reciter.id })}
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                  active ? 'border-primary/40 bg-secondary' : 'border-border bg-card'
                }`}
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{reciter.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {reciter.style ?? '—'}
                    {reciter.enabled === 0 ? ` · ${t('reciters.pending')}` : ''}
                  </span>
                </span>
                <span
                  className={`size-3 rounded-full ${active ? 'bg-primary' : 'border border-border'}`}
                  aria-hidden
                />
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t('builder.display')}</span>
        <ToggleRow
          label={t('builder.showArabic')}
          checked={draft.showArabic}
          onChange={(checked) => setDraft({ ...draft, showArabic: checked })}
        />
        <ToggleRow
          label={t('builder.showTransliteration')}
          checked={draft.showTransliteration}
          onChange={(checked) => setDraft({ ...draft, showTransliteration: checked })}
        />
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-center text-sm text-muted-foreground">
          {ayahsLoading || ayahsError
            ? '…'
            : t('builder.estimated', { min: formatMinutes(estimateMs), reps: repetitionTotal })}
        </p>
        {!ayahsLoading && !ayahsError && estimateMs > 30 * 60_000 ? (
          <p className="text-center text-xs text-destructive">{t('builder.longWarning')}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className={buttonClasses('outline', 'lg', true)}
          onClick={() => void save(false)}
        >
          {t('common.savePreset')}
        </button>
        <button
          type="button"
          className={buttonClasses('primary', 'lg', true)}
          onClick={() => void save(true)}
        >
          {t('common.saveAndStart')}
        </button>
      </div>
    </Screen>
  )
}

export default function BuilderPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <BuilderInner />
    </Suspense>
  )
}
