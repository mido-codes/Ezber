'use client'

import { Card, SectionHeading } from '@/components/design-system/card'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'

export default function CreditsPage() {
  const app = useApp()
  if (app.error) return <AppError message={app.error} />
  if (!app.ready || !app.summary) return <AppSplash message={app.startupMessage} />
  const { t, summary } = app

  const sections = [
    { title: t('credits.quranText'), body: t('credits.quranTextBody') },
    { title: t('credits.transliteration'), body: t('credits.transliterationBody') },
    { title: t('credits.timings'), body: t('credits.timingsBody') },
    { title: t('credits.fonts'), body: t('credits.fontsBody') },
    { title: t('credits.icons'), body: t('credits.iconsBody') },
  ]

  return (
    <Screen>
      <AppHeader title={t('credits.title')} back />
      <p className="text-sm leading-relaxed text-muted-foreground">{t('credits.intro')}</p>

      {summary.mode === 'placeholder' ? (
        <Card className="flex flex-col gap-2">
          <SectionHeading title={t('credits.placeholder')} description={t('credits.placeholderBody')} />
          <p className="text-xs text-muted-foreground">{t('credits.noBundle')}</p>
        </Card>
      ) : null}

      {sections.map((section) => (
        <Card key={section.title} className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">{section.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
        </Card>
      ))}

      {summary.licenses.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <SectionHeading title={t('credits.licenses')} />
          {summary.licenses.map((license) => (
            <div key={license.id} className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{license.name}</span>
              {license.attribution ? (
                <span className="text-xs text-muted-foreground">{license.attribution}</span>
              ) : null}
              {license.url ? (
                <a
                  href={license.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline"
                >
                  {license.url}
                </a>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      {summary.attribution.length > 0 ? (
        <Card className="flex flex-col gap-2">
          <SectionHeading title={t('credits.attribution')} />
          {summary.attribution.map((line) => (
            <p key={line} className="text-xs leading-relaxed text-muted-foreground">
              {line}
            </p>
          ))}
        </Card>
      ) : null}

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>{t('credits.schemaVersion', { version: summary.schema_version })}</p>
        <p>{t('credits.mode', { mode: summary.mode })}</p>
        {summary.pipeline_version ? <p>Pipeline {summary.pipeline_version}</p> : null}
        {summary.bundle_id ? <p>{summary.bundle_id}</p> : null}
      </div>
    </Screen>
  )
}
