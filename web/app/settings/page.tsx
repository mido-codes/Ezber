'use client'

import { Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { Card, SectionHeading } from '@/components/design-system/card'
import { SegmentedChoice, Stepper, ToggleRow } from '@/components/design-system/controls'
import { ErrorBlock } from '@/components/layout/async-state'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp, type ThemeSetting } from '@/lib/app/app-context'
import type { Language } from '@/lib/i18n'
import { downloadSurahAudio } from '@/lib/pwa/downloads'
import { userStorageEstimate } from '@/lib/user/repository'
import type { CacheStats } from '@/lib/content/types'
import type { UserExport } from '@/lib/user/types'

const APP_VERSION = '0.1.0'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export default function SettingsPage() {
  const app = useApp()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<string | null>(null)
  const [cache, setCache] = useState<CacheStats | null>(null)

  const loadCacheStats = useCallback(async () => {
    if (!app.content) return
    setCache(await app.content.cacheStats())
  }, [app.content])

  useEffect(() => {
    void userStorageEstimate().then(setStorage)
    void loadCacheStats()
  }, [app.revision, loadCacheStats])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || !app.user || !app.content || !app.summary) {
    return <AppSplash message={app.startupMessage} />
  }
  const { t, summary } = app
  const standalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

  const exportData = async () => {
    const data = await app.user!.exportUserData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ezber-user-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as UserExport
      await app.user!.importUserData(parsed)
      app.refresh()
      setMessage(t('settings.importSuccess'))
    } catch {
      setMessage(t('settings.importError'))
    }
  }

  const downloadPresets = async () => {
    const presets = await app.user!.listPresets()
    setDownloadState(t('common.loading'))
    let files = 0
    for (const preset of presets) {
      const result = await downloadSurahAudio(
        app.content!,
        app.user!,
        preset.reciter_id,
        preset.surah_id,
      )
      files += result.files
    }
    setDownloadState(files === 0 ? t('settings.contentPlaceholder') : `${files} files`)
    app.refresh()
  }

  return (
    <Screen>
      <AppHeader title={t('settings.title')} />

      <Card className="flex flex-col gap-4">
        <SectionHeading title={t('settings.language')} />
        <SegmentedChoice<Language>
          value={app.language}
          onChange={(language) => void app.setLanguage(language)}
          options={[
            { value: 'en', label: t('settings.english') },
            { value: 'tr', label: t('settings.turkish') },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHeading title={t('settings.theme')} />
        <SegmentedChoice<ThemeSetting>
          value={app.theme}
          onChange={(theme) => void app.setTheme(theme)}
          options={[
            { value: 'system', label: t('settings.system') },
            { value: 'light', label: t('settings.light') },
            { value: 'dark', label: t('settings.dark') },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading title={t('settings.defaults')} />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{t('settings.defaultRepeats')}</span>
          <Stepper
            label={t('settings.defaultRepeats')}
            value={Number(app.setting('defaults.repeat_count', '5')) || 5}
            onChange={(value) => void app.setSetting('defaults.repeat_count', String(value))}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{t('settings.defaultSectionRepeats')}</span>
          <Stepper
            label={t('settings.defaultSectionRepeats')}
            value={Number(app.setting('defaults.section_repeats', '1')) || 1}
            onChange={(value) => void app.setSetting('defaults.section_repeats', String(value))}
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-foreground">{t('settings.pauseBetween')}</span>
          <SegmentedChoice<number>
            value={Number(app.setting('defaults.pause_between_repeat_ms', '500')) || 0}
            onChange={(value) => void app.setSetting('defaults.pause_between_repeat_ms', String(value))}
            options={[
              { value: 0, label: '0s' },
              { value: 500, label: '0.5s' },
              { value: 1000, label: '1s' },
              { value: 2000, label: '2s' },
            ]}
          />
        </div>
        <ToggleRow
          label={t('settings.showArabic')}
          checked={app.setting('defaults.show_arabic', '0') === '1'}
          onChange={(checked) => void app.setSetting('defaults.show_arabic', checked ? '1' : '0')}
        />
        <ToggleRow
          label={t('settings.showTransliteration')}
          checked={app.setting('defaults.show_transliteration', '1') !== '0'}
          onChange={(checked) =>
            void app.setSetting('defaults.show_transliteration', checked ? '1' : '0')
          }
        />
        <Link href="/reciters/" className="text-sm font-medium text-primary">
          {t('settings.defaultReciter')}
        </Link>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHeading title={t('settings.audio')} />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('settings.navigation')}</span>
          <SegmentedChoice
            value={app.setting('audio.navigation', 'duck')}
            onChange={(value) => void app.setSetting('audio.navigation', value)}
            options={[
              { value: 'duck', label: t('settings.navigationDuck') },
              { value: 'pause', label: t('settings.navigationPause') },
              { value: 'keep', label: t('settings.navigationKeep') },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('settings.calls')}</span>
          <SegmentedChoice
            value={app.setting('audio.calls', 'pauseAndResume')}
            onChange={(value) => void app.setSetting('audio.calls', value)}
            options={[
              { value: 'pauseAndResume', label: t('settings.callsPauseResume') },
              { value: 'pauseOnly', label: t('settings.callsPauseOnly') },
              { value: 'keep', label: t('settings.callsKeep') },
            ]}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Lock-screen play, pause, next and previous use the Media Session API while Ezber plays.
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHeading title={t('settings.downloads')} />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">{t('settings.downloadScope')}</span>
          <SegmentedChoice
            value={app.setting('downloads.scope', 'surah')}
            onChange={(value) => void app.setSetting('downloads.scope', value)}
            options={[
              { value: 'surah', label: t('settings.downloadSurah') },
              { value: 'preset', label: t('settings.downloadPreset') },
            ]}
          />
        </div>
        <button
          type="button"
          className={buttonClasses('outline', 'sm', false) + ' self-start'}
          onClick={() => void downloadPresets()}
        >
          <Download className="size-4" aria-hidden />
          {t('settings.downloadSurah')}
        </button>
        {downloadState ? <p className="text-xs text-muted-foreground">{downloadState}</p> : null}
        {storage ? (
          <p className="text-xs text-muted-foreground">
            {t('settings.storageValue', {
              used: formatBytes(storage.usage),
              quota: formatBytes(storage.quota),
            })}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionHeading title={t('settings.content')} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {summary.mode === 'bundle'
            ? t('settings.contentReady')
            : t('settings.contentPlaceholder')}
        </p>
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>
            {summary.source === 'network'
              ? t('settings.contentSourceNetwork')
              : summary.source === 'cache'
                ? t('settings.contentSourceCache')
                : t('settings.contentSourcePlaceholder')}
          </span>
          <span>
            {t('settings.bundleCounts', {
              ayahs: summary.counts.ayahs ?? 0,
              surahs: summary.counts.surahs ?? 0,
              reciters: summary.counts.reciters ?? 0,
            })}
          </span>
          {summary.bundle_id ? <span>{summary.bundle_id}</span> : null}
        </div>

        {summary.problem ? (
          <ErrorBlock
            message={summary.problem.message}
            onRetry={async () => {
              await app.content!.reloadIndex()
              app.refreshSummary()
              await loadCacheStats()
            }}
          />
        ) : null}

        <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
          <span className="text-sm font-medium text-foreground">{t('settings.cacheTitle')}</span>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.cacheBody')}</p>
          <p className="text-xs text-muted-foreground">
            {summary.cached_surahs === 0 && summary.cached_segment_sets === 0
              ? t('settings.cacheEmpty')
              : t('settings.cacheStats', {
                  surahs: summary.cached_surahs,
                  segments: summary.cached_segment_sets,
                  ayahs: cache?.ayah_rows ?? 0,
                })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClasses('outline', 'sm', false)}
            onClick={async () => {
              try {
                await app.content!.reloadIndex()
                app.refreshSummary()
                await loadCacheStats()
                setMessage(t('settings.indexRefreshed'))
              } catch (error) {
                setMessage(error instanceof Error ? error.message : String(error))
              }
            }}
          >
            <RefreshCw className="size-4" aria-hidden />
            {t('settings.refreshIndex')}
          </button>
          <button
            type="button"
            className={buttonClasses('destructive', 'sm', false)}
            onClick={async () => {
              await app.content!.clearContentCache()
              app.refreshSummary()
              await loadCacheStats()
              setMessage(t('settings.cacheCleared'))
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('settings.clearCache')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.refreshIndexHint')}</p>
        <p className="text-xs text-muted-foreground">{t('settings.clearCacheBody')}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading title={t('settings.data')} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClasses('outline', 'sm', false)} onClick={() => void exportData()}>
            <Download className="size-4" aria-hidden />
            {t('settings.export')}
          </button>
          <button
            type="button"
            className={buttonClasses('outline', 'sm', false)}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {t('settings.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importData(file)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className={buttonClasses('destructive', 'sm', false)}
            onClick={async () => {
              if (!window.confirm(t('settings.resetBody'))) return
              await app.user!.resetUserData()
              app.refresh()
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t('settings.reset')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.resetBody')}</p>
        {message ? <p className="text-xs text-primary">{message}</p> : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading title={t('settings.install')} />
        <p className="text-sm leading-relaxed text-muted-foreground">{t('settings.installBody')}</p>
        {standalone ? (
          <p className="text-sm font-medium text-primary">{t('settings.installed')}</p>
        ) : installEvent ? (
          <button
            type="button"
            className={buttonClasses('primary', 'md', false) + ' self-start'}
            onClick={async () => {
              await installEvent.prompt()
              setInstallEvent(null)
            }}
          >
            {t('settings.installButton')}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Use your browser’s “Add to Home Screen” action to install Ezber.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading title={t('settings.about')} />
        <p className="text-sm text-muted-foreground">{t('settings.version', { version: APP_VERSION })}</p>
        <p className="text-sm text-muted-foreground">
          {summary.pipeline_version
            ? `Content pipeline ${summary.pipeline_version} · ${summary.bundle_id}`
            : summary.bundle_id}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('credits.schemaVersion', { version: summary.schema_version })} ·{' '}
          {t('credits.mode', { mode: summary.mode })}
        </p>
        <Link href="/credits/" className="text-sm font-medium text-primary">
          {t('settings.credits')}
        </Link>
      </Card>
    </Screen>
  )
}
