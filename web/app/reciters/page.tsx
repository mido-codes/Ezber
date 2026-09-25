'use client'

import { Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, buttonClasses } from '@/components/design-system/button'
import { Card } from '@/components/design-system/card'
import { AppError, AppHeader, AppSplash, PlaceholderBanner, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import { placeholderSampleUrl } from '@/lib/player/audio'

export default function RecitersPage() {
  const app = useApp()
  const [playingId, setPlayingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { data, loading } = useAsync(async () => {
    if (!app.content || !app.user) return null
    const reciters = await app.content.reciters()
    const defaultId = Number(await app.user.getSetting('defaults.reciter_id')) || reciters[0]?.id
    return { reciters, defaultId }
  }, [app.ready, app.revision])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app

  const toggleSample = (reciterId: number) => {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    if (playingId === reciterId && !audio.paused) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.src = placeholderSampleUrl()
    audio.onended = () => setPlayingId(null)
    void audio.play()
    setPlayingId(reciterId)
  }

  return (
    <Screen>
      <AppHeader title={t('reciters.title')} back />
      <PlaceholderBanner />
      <p className="text-sm leading-relaxed text-muted-foreground">{t('reciters.body')}</p>

      <div className="flex flex-col gap-3">
        {data.reciters.map((reciter) => {
          const isDefault = reciter.id === data.defaultId
          return (
            <Card key={reciter.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-medium text-foreground">{reciter.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {reciter.style ?? '—'}
                    {reciter.qirat ? ` · ${reciter.qirat}` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {reciter.attribution ||
                      (reciter.source === 'placeholder' ? t('reciters.pending') : reciter.source)}
                  </span>
                </div>
                <Button
                  tone="outline"
                  size="sm"
                  onClick={() => toggleSample(reciter.id)}
                  aria-label={playingId === reciter.id ? t('common.stopSample') : t('common.playSample')}
                >
                  {playingId === reciter.id ? (
                    <Pause className="size-4" aria-hidden />
                  ) : (
                    <Play className="size-4" aria-hidden />
                  )}
                  {t('common.playSample')}
                </Button>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-xs text-muted-foreground">
                  {isDefault ? t('reciters.default') : ''}
                </span>
                {isDefault ? (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    {t('reciters.default')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={buttonClasses('ghost', 'sm')}
                    onClick={async () => {
                      await app.setSetting('defaults.reciter_id', String(reciter.id))
                    }}
                  >
                    {t('reciters.setDefault')}
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}
