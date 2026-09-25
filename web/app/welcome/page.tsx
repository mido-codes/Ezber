'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { buttonClasses } from '@/components/design-system/button'
import { Card } from '@/components/design-system/card'
import { SegmentedChoice, Stepper } from '@/components/design-system/controls'
import { AppError, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'

type Reading = 'arabic' | 'transliteration' | 'both'

export default function WelcomePage() {
  const app = useApp()
  const router = useRouter()
  const [reading, setReading] = useState<Reading>('transliteration')
  const [reciterId, setReciterId] = useState<number | null>(null)
  const [repeats, setRepeats] = useState(5)
  const [saving, setSaving] = useState(false)

  const { data, loading } = useAsync(async () => {
    if (!app.content) return null
    return { reciters: await app.content.reciters() }
  }, [app.ready])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app
  const resolvedReciter = reciterId ?? data.reciters[0]?.id ?? 1

  const finish = async (skip = false) => {
    setSaving(true)
    await app.setSettings({
      'onboarding.completed': '1',
      'defaults.show_arabic': reading === 'arabic' || reading === 'both' ? '1' : '0',
      'defaults.show_transliteration': reading === 'transliteration' || reading === 'both' ? '1' : '0',
      'defaults.reciter_id': skip ? app.setting('defaults.reciter_id') : String(resolvedReciter),
      'defaults.repeat_count': skip ? app.setting('defaults.repeat_count', '5') : String(repeats),
    })
    router.replace('/')
  }

  return (
    <Screen withTabBar={false} className="justify-center pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-foreground">{t('welcome.title')}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('welcome.body')}</p>
      </div>

      <Card className="flex flex-col gap-4">
        <span className="text-sm font-medium text-foreground">{t('welcome.reading')}</span>
        <SegmentedChoice<Reading>
          value={reading}
          onChange={setReading}
          options={[
            { value: 'arabic', label: t('welcome.arabic') },
            { value: 'transliteration', label: t('welcome.transliteration') },
            { value: 'both', label: t('welcome.both') },
          ]}
        />
        <p className="font-serif text-xl leading-snug text-foreground">Ar-Rahman</p>
        {reading !== 'transliteration' ? (
          <p className="font-arabic text-right text-foreground">ٱلرَّحْمَٰنُ</p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-sm font-medium text-foreground">{t('welcome.reciter')}</span>
        <div className="flex flex-col gap-2">
          {data.reciters.map((reciter) => (
            <button
              key={reciter.id}
              type="button"
              onClick={() => setReciterId(reciter.id)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                reciter.id === resolvedReciter ? 'border-primary/40 bg-secondary' : 'border-border bg-card'
              }`}
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{reciter.name}</span>
                <span className="text-xs text-muted-foreground">{reciter.style ?? '—'}</span>
              </span>
              <span
                className={`size-3 rounded-full ${reciter.id === resolvedReciter ? 'bg-primary' : 'border border-border'}`}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{t('welcome.repeats')}</span>
        <Stepper label={t('welcome.repeats')} value={repeats} onChange={setRepeats} />
      </Card>

      <button
        type="button"
        className={buttonClasses('primary', 'lg', true)}
        disabled={saving}
        onClick={() => void finish(false)}
      >
        {t('welcome.finish')}
      </button>
      <button
        type="button"
        className={buttonClasses('ghost', 'md', false) + ' self-center'}
        disabled={saving}
        onClick={() => void finish(true)}
      >
        {t('welcome.skip')}
      </button>
    </Screen>
  )
}
