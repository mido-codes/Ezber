'use client'

import { NotebookPen, RotateCcw, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { Card, SectionHeading } from '@/components/design-system/card'
import { ErrorBlock, LoadingBlock, PlaceholderReadingNote } from '@/components/layout/async-state'
import { AccentChip, VerseStateChip, type VerseState } from '@/components/design-system/chips'
import { RepeatBar, SectionSegments } from '@/components/design-system/progress'
import { TransportControls } from '@/components/design-system/transport-controls'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import type { ReciterRow, SurahRow } from '@/lib/content/types'
import { ContentDrillAudioResolver } from '@/lib/player/audio'
import { DrillEngine, type DrillEngineState } from '@/lib/player/drill-engine'
import { buildDrillQueue, type DrillItem } from '@/lib/player/queue'
import { requestWakeLock } from '@/lib/pwa/wake-lock'
import type { NoteRow, PlanStateRow, PresetRow, Rating } from '@/lib/user/types'
import { formatDuration, formatRelativeDay, nowIso } from '@/lib/utils'

const INITIAL_STATE: DrillEngineState = {
  status: 'idle',
  pass: 1,
  index: 0,
  globalIndex: 0,
  item: null,
  positionMs: 0,
  durationMs: 0,
  activeWord: 0,
  completedRepetitions: 0,
  totalRepetitions: 0,
  sectionRepeats: 1,
  usingPlaceholderAudio: false,
  isGap: false,
  error: null,
}

interface PlayerData {
  preset: PresetRow
  surah: SurahRow
  reciter: ReciterRow
  queue: DrillItem[]
  planState: PlanStateRow | undefined
}

function Player() {
  const app = useApp()
  const router = useRouter()
  const params = useSearchParams()
  const presetId = params?.get('id') ?? null

  const { data, loading, error, reload } = useAsync(async (): Promise<PlayerData | null> => {
    if (!app.content || !app.user) return null
    let preset: PresetRow | null = null
    if (presetId) preset = (await app.user.getPreset(presetId)) ?? null
    if (!preset) {
      const lastId = await app.user.getSetting('ui.last_preset_id')
      preset = (await app.user.getPreset(lastId)) ?? (await app.user.listPresets())[0] ?? null
    }
    if (!preset) return null
    const [surah, ayahs, reciter, overrides, planState] = await Promise.all([
      app.content.surah(preset.surah_id),
      app.content.ayahs(preset.surah_id),
      app.content.reciter(preset.reciter_id),
      app.user.presetOverrides(preset.id),
      app.user.planState(preset.id),
    ])
    if (!surah || !reciter) return null
    const queue = buildDrillQueue(preset, overrides, ayahs)
    return { preset, surah, reciter, queue, planState }
  }, [app.ready, presetId])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready) return <AppSplash message={app.startupMessage} />
  if (error || (!loading && !data)) {
    return (
      <Screen withTabBar={false}>
        <AppHeader title={app.t('common.loading')} back />
        <ErrorBlock
          message={error === 'offline' ? app.t('player.offline') : (error ?? app.t('player.loadFailed'))}
          onRetry={reload}
        />
      </Screen>
    )
  }
  if (loading || !data) {
    return (
      <Screen withTabBar={false}>
        <AppHeader title={app.t('common.loading')} back />
        <LoadingBlock message={app.t('player.loadingSurah')} />
      </Screen>
    )
  }

  return (
    <PlayerSession
      key={`${data.preset.id}-${data.queue.length}`}
      preset={data.preset}
      surah={data.surah}
      reciter={data.reciter}
      queue={data.queue}
      planState={data.planState}
      onExit={(href) => router.push(href)}
    />
  )
}

function PlayerSession({
  preset,
  surah,
  reciter,
  queue,
  planState,
  onExit,
}: PlayerData & { onExit: (href: string) => void }) {
  const app = useApp()
  const { t } = app
  const engineRef = useRef<DrillEngine | null>(null)
  const sessionIdRef = useRef<number | null>(null)
  const coveredRef = useRef<Set<string>>(new Set())
  const handleCompletedRef = useRef<() => void>(() => {})
  const [engineState, setEngineState] = useState<DrillEngineState>(INITIAL_STATE)
  const [activeItem, setActiveItem] = useState<DrillItem | null>(queue[0] ?? null)
  const [version, setVersion] = useState(0)
  const [noteDraft, setNoteDraft] = useState('')
  const [ratingState, setRatingState] = useState<VerseState | null>(null)
  const [resumedNotice] = useState((planState?.plan_index ?? 0) > 0)

  const perPass = Math.max(1, queue.length)
  const startPass = planState ? Math.floor(planState.plan_index / perPass) + 1 : 1
  const startIndex = planState ? planState.plan_index % perPass : 0

  handleCompletedRef.current = () => {
    const sessionId = sessionIdRef.current
    if (!app.user || sessionId === null) return
    const user = app.user
    void (async () => {
      await user.updateSession(sessionId, {
        ended_at: nowIso(),
        interrupted: 0,
        repetitions: engineRef.current?.state.completedRepetitions ?? 0,
        verses_covered: coveredRef.current.size,
      })
      await user.savePlanState({
        preset_id: preset.id,
        plan_index: 0,
        position_ms: 0,
        repetition_counters_json: JSON.stringify({ pass: 1, index: 0, items: perPass }),
        updated_at: nowIso(),
      })
      sessionIdRef.current = null
      app.refresh()
    })()
  }

  useEffect(() => {
    if (!app.user || !app.content || queue.length === 0) return
    const user = app.user
    const content = app.content
    const resolver = new ContentDrillAudioResolver(content)
    let disposed = false

    const engine = new DrillEngine({
      queue,
      resolver,
      reciter,
      sectionRepeats: preset.section_repeats,
      pauseBetweenRepeatsMs: preset.pause_between_repeat_ms,
      start: { pass: startPass, index: startIndex, positionMs: planState?.position_ms ?? 0 },
      nowPlaying: {
        presetName: preset.name,
        surahName: surah.name_latin,
        reciterName: reciter.name,
      },
      callbacks: {
        onState: (state) => setEngineState(state),
        onVerseEntered: (item) => {
          setActiveItem(item)
          setRatingState(null)
        },
        onItemComplete: (item, globalIndex) => {
          void (async () => {
            coveredRef.current.add(item.ayah.verse_key)
            await user.recordRepeat(preset.id, item.ayah.ayah, item.ayah.verse_key)
            const sessionId = sessionIdRef.current
            if (sessionId !== null) {
              await user.updateSession(sessionId, {
                repetitions: engine.state.completedRepetitions + 1,
                verses_covered: coveredRef.current.size,
              })
            }
            await user.savePlanState({
              preset_id: preset.id,
              plan_index: globalIndex + 1,
              position_ms: 0,
              repetition_counters_json: JSON.stringify({
                pass: Math.floor((globalIndex + 1) / perPass) + 1,
                index: (globalIndex + 1) % perPass,
                items: perPass,
              }),
              updated_at: nowIso(),
            })
            app.refresh()
          })()
        },
        onCompleted: () => handleCompletedRef.current(),
      },
    })
    engineRef.current = engine

    void (async () => {
      await user.touchPreset(preset.id)
      await app.setSetting('ui.last_preset_id', preset.id)
      const session = (await user.activeSession(preset.id)) ?? (await user.startSession(preset.id))
      if (disposed) return
      sessionIdRef.current = session.id ?? null
      coveredRef.current = new Set()
      await engine.prepare(false)
    })()

    return () => {
      disposed = true
      const snapshot = engine.state
      void (async () => {
        await user.savePlanState({
          preset_id: preset.id,
          plan_index: snapshot.globalIndex,
          position_ms: snapshot.positionMs,
          repetition_counters_json: JSON.stringify({
            pass: snapshot.pass,
            index: snapshot.index,
            items: perPass,
          }),
          updated_at: nowIso(),
        })
        const sessionId = sessionIdRef.current
        if (sessionId !== null) {
          await user.updateSession(sessionId, {
            ended_at: nowIso(),
            interrupted: snapshot.status === 'completed' ? 0 : 1,
            repetitions: snapshot.completedRepetitions,
            verses_covered: coveredRef.current.size,
          })
        }
        app.refresh()
      })()
      engine.stop()
      engineRef.current = null
    }
    // The engine lives for one preset session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, preset.id, reciter.id, perPass, startIndex, startPass])

  useEffect(() => {
    let release: (() => void) | null = null
    void requestWakeLock().then((releaseLock) => {
      release = releaseLock
    })
    return () => release?.()
  }, [])

  const activeVerseKey = activeItem?.ayah.verse_key ?? null

  const { data: notes } = useAsync(async () => {
    if (!app.user || !activeVerseKey) return []
    return app.user.notesForVerse(activeVerseKey)
  }, [app.ready, activeVerseKey, version, app.revision])

  const { data: progressRow } = useAsync(async () => {
    if (!app.user || !activeVerseKey) return null
    const rows = await app.user.progressForVerse(activeVerseKey)
    return rows[0] ?? null
  }, [app.ready, activeVerseKey, version, app.revision])

  const { data: ratings } = useAsync(async () => {
    if (!app.user || !activeVerseKey) return []
    return app.user.ratingsForVerse(activeVerseKey)
  }, [app.ready, activeVerseKey, version, app.revision])

  const rate = useCallback(
    async (rating: Rating) => {
      if (!app.user || !activeVerseKey) return
      const next = await app.user.rateVerse(activeVerseKey, rating)
      setRatingState(next)
      setVersion((value) => value + 1)
      app.refresh()
    },
    [app, activeVerseKey],
  )

  const saveNote = useCallback(async () => {
    if (!app.user || !activeVerseKey) return
    const body = noteDraft.trim()
    if (!body) return
    await app.user.saveNote({ verse_key: activeVerseKey, body_md: body })
    setNoteDraft('')
    setVersion((value) => value + 1)
    app.refresh()
  }, [app, activeVerseKey, noteDraft])

  const state: VerseState = ratingState ?? progressRow?.memorization_state ?? 'new'
  const solidCount = (ratings ?? []).filter((rating) => rating.rating === 'solid').length
  const shakyCount = (ratings ?? []).filter((rating) => rating.rating === 'shaky').length
  const words = useMemo(
    () => (activeItem ? activeItem.ayah.transliteration.split(/\s+/).filter(Boolean) : []),
    [activeItem],
  )
  const completed = engineState.status === 'completed'
  const positionInSection = activeItem
    ? Math.max(1, activeItem.ayah.ayah - preset.from_ayah + 1)
    : 1

  const restart = () => {
    coveredRef.current = new Set()
    engineRef.current?.restart()
  }

  return (
    <Screen withTabBar={false} className="gap-4">
      <AppHeader
        title={preset.name}
        eyebrow={`${surah.name_latin} ${preset.from_ayah}–${preset.to_ayah}`}
        back
        actions={<span className="text-xs text-muted-foreground">{reciter.name}</span>}
      />

      {app.content?.isPlaceholderSurah(preset.surah_id) ? <PlaceholderReadingNote /> : null}

      {completed ? (
        <Card className="flex flex-col gap-4">
          <SectionHeading
            title={t('player.completeTitle')}
            description={t('player.completeBody', {
              reps: engineState.completedRepetitions,
              verses: coveredRef.current.size,
            })}
          />
          <button type="button" className={buttonClasses('primary', 'lg', true)} onClick={restart}>
            <RotateCcw className="size-5" aria-hidden />
            {t('player.practiceAgain')}
          </button>
          <button
            type="button"
            className={buttonClasses('outline', 'lg', true)}
            onClick={() => onExit('/')}
          >
            {t('player.backHome')}
          </button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AccentChip>
              {t('player.repeatOf', {
                n: activeItem?.repeat_index ?? 1,
                total: activeItem?.repeat_count ?? preset.repeat_count,
              })}
            </AccentChip>
            <span className="text-sm text-muted-foreground">
              {t('player.verseOf', {
                n: positionInSection,
                total: preset.to_ayah - preset.from_ayah + 1,
              })}
            </span>
            {preset.section_repeats !== 1 ? (
              <span className="text-sm text-muted-foreground">
                {preset.section_repeats === 0
                  ? t('player.passInfinite', { n: engineState.pass })
                  : t('player.passOf', { n: engineState.pass, total: preset.section_repeats })}
              </span>
            ) : null}
          </div>

          {resumedNotice ? (
            <p className="text-xs text-muted-foreground">
              {t('player.resumeNotice', {
                verse: activeItem?.ayah.ayah ?? preset.from_ayah,
                repeat: activeItem?.repeat_index ?? 1,
              })}
            </p>
          ) : null}

          <Card className="flex min-h-48 flex-col justify-center gap-4">
            {preset.show_arabic === 1 ? (
              <p className="font-arabic text-right text-foreground">{activeItem?.ayah.text_uthmani}</p>
            ) : null}
            {preset.show_transliteration === 1 ? (
              <p className="font-serif text-3xl leading-snug text-foreground">
                {words.map((word, index) => (
                  <span key={`${word}-${index}`}>
                    {index > 0 ? ' ' : ''}
                    <span
                      className={
                        engineState.activeWord === index + 1
                          ? 'rounded-md bg-accent px-1 text-accent-foreground'
                          : undefined
                      }
                    >
                      {word}
                    </span>
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('player.transliterationHidden')}</p>
            )}
            {engineState.usingPlaceholderAudio ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('player.placeholderAudio')}
              </p>
            ) : null}
          </Card>

          <div className="flex flex-col gap-2">
            <SectionSegments
              count={preset.to_ayah - preset.from_ayah + 1}
              active={positionInSection - 1}
            />
            <RepeatBar
              value={activeItem?.repeat_index ?? 1}
              max={activeItem?.repeat_count ?? preset.repeat_count}
            />
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{formatDuration(engineState.positionMs)}</span>
              <span>{formatDuration(engineState.durationMs)}</span>
            </div>
          </div>

          <TransportControls
            playing={engineState.status === 'playing'}
            labels={{
              play: t('common.play'),
              pause: t('common.pause'),
              prevVerse: t('player.prevVerse'),
              nextVerse: t('player.nextVerse'),
              prevRepeat: t('player.prevRepeat'),
              nextRepeat: t('player.nextRepeat'),
            }}
            onToggle={() => void engineRef.current?.toggle()}
            onPrevVerse={() => engineRef.current?.previousVerse()}
            onNextVerse={() => engineRef.current?.nextVerse()}
            onPrevRepeat={() => engineRef.current?.previousRepeat()}
            onNextRepeat={() => engineRef.current?.nextRepeat()}
          />
          {engineState.error ? (
            <p className="text-center text-xs text-destructive">{engineState.error}</p>
          ) : null}

          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t('player.rateTitle')}</span>
              <VerseStateChip state={state} label={t(`common.${state}`)} />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className={buttonClasses('outline', 'md', true)}
                onClick={() => void rate('solid')}
              >
                <ThumbsUp className="size-4" aria-hidden />
                {t('common.solid')}
              </button>
              <button
                type="button"
                className={buttonClasses('outline', 'md', true)}
                onClick={() => void rate('shaky')}
              >
                <ThumbsDown className="size-4" aria-hidden />
                {t('common.shaky')}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('player.rateHint')}</p>
            <p className="text-xs text-muted-foreground">
              {t('progress.stateBecause', { solid: solidCount, shaky: shakyCount })}
            </p>
          </Card>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <NotebookPen className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">{t('player.pinnedNotes')}</span>
            </div>
            {(notes ?? []).map((note: NoteRow) => (
              <div key={note.id} className="rounded-2xl bg-muted px-3 py-2">
                <p className="text-sm leading-relaxed text-foreground">{note.body_md}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatRelativeDay(note.updated_at ?? note.created_at)} ·{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={async () => {
                      if (!app.user || note.id === undefined) return
                      await app.user.deleteNote(note.id)
                      setVersion((value) => value + 1)
                      app.refresh()
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </p>
              </div>
            ))}
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={t('player.notePlaceholder', { key: activeVerseKey ?? '' })}
              rows={2}
              className="w-full resize-none rounded-2xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <button
              type="button"
              className={buttonClasses('outline', 'sm', false) + ' self-start'}
              onClick={() => void saveNote()}
              disabled={!noteDraft.trim()}
            >
              {t('player.saveNote')}
            </button>
          </Card>
        </>
      )}
    </Screen>
  )
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<AppSplash />}>
      <Player />
    </Suspense>
  )
}
