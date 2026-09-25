'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { EmptyState } from '@/components/design-system/card'
import { PresetCard, TextAction } from '@/components/design-system/preset-card'
import { AppError, AppHeader, AppSplash, PlaceholderBanner, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import type { SurahRow } from '@/lib/content/types'
import type { PresetRow } from '@/lib/user/types'
import { formatRelativeDay } from '@/lib/utils'

export default function PresetsPage() {
  const app = useApp()
  const router = useRouter()
  const [version, setVersion] = useState(0)

  const { data, loading } = useAsync(async () => {
    if (!app.content || !app.user) return null
    const [presets, surahs] = await Promise.all([app.user.listPresets(), app.content.surahs()])
    const surahMap = new Map<number, SurahRow>(surahs.map((surah: SurahRow) => [surah.id, surah]))
    return { presets, surahMap }
  }, [app.ready, app.revision, version])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app

  const play = async (preset: PresetRow) => {
    await app.user?.touchPreset(preset.id)
    await app.setSetting('ui.last_preset_id', preset.id)
    router.push(`/player/?id=${preset.id}`)
  }

  return (
    <Screen>
      <AppHeader
        title={t('presets.title')}
        actions={
          <Link href="/browse/" aria-label={t('home.newDrill')} className={buttonClasses('outline', 'sm')}>
            <Plus className="size-4" aria-hidden />
          </Link>
        }
      />
      <PlaceholderBanner />

      {data.presets.length === 0 ? (
        <EmptyState
          title={t('presets.emptyTitle')}
          message={t('presets.emptyBody')}
          action={
            <Link href="/browse/" className={buttonClasses('primary', 'lg')}>
              {t('home.newDrill')}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.presets.map((preset) => {
            const surah = data.surahMap.get(preset.surah_id)
            const meta = `${surah?.name_latin ?? preset.surah_id} ${preset.from_ayah}–${preset.to_ayah} · ×${preset.repeat_count}${
              preset.section_repeats === 0 ? ' · ∞' : preset.section_repeats > 1 ? ` · pass ×${preset.section_repeats}` : ''
            }`
            return (
              <PresetCard
                key={preset.id}
                name={preset.name}
                meta={meta}
                status={
                  preset.last_used_at
                    ? t('presets.lastUsed', { when: formatRelativeDay(preset.last_used_at) })
                    : t('presets.neverUsed')
                }
                href={`/builder/?id=${preset.id}`}
                playLabel={t('common.start')}
                onPlay={() => void play(preset)}
                actions={
                  <>
                    <TextAction onClick={() => router.push(`/builder/?id=${preset.id}`)}>
                      {t('common.edit')}
                    </TextAction>
                    <TextAction
                      onClick={async () => {
                        await app.user?.duplicatePreset(preset.id)
                        app.refresh()
                        setVersion((value) => value + 1)
                      }}
                    >
                      {t('common.duplicate')}
                    </TextAction>
                    <TextAction
                      tone="destructive"
                      onClick={async () => {
                        if (!window.confirm(t('presets.deleteBody', { name: preset.name }))) return
                        await app.user?.deletePreset(preset.id)
                        app.refresh()
                        setVersion((value) => value + 1)
                      }}
                    >
                      {t('common.delete')}
                    </TextAction>
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </Screen>
  )
}
