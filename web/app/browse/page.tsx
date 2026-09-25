'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AppError, AppHeader, AppSplash, PlaceholderBanner, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import type { SurahRow } from '@/lib/content/types'

export default function BrowsePage() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const { data, loading } = useAsync(async () => {
    if (!app.content || !app.user) return null
    const surahs = await app.content.surahs()
    const presets = await app.user.listPresets()
    const recentIds = [...new Set(presets.map((preset) => preset.surah_id))]
    return { surahs, recentIds }
  }, [app.ready, app.revision])

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return data.surahs
    return data.surahs.filter((surah) => {
      return (
        surah.name_latin.toLowerCase().includes(needle) ||
        surah.name_english.toLowerCase().includes(needle) ||
        surah.name_arabic.includes(needle) ||
        String(surah.id) === needle
      )
    })
  }, [data, query])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />

  const { t } = app
  const recent = data.recentIds
    .map((id) => data.surahs.find((surah) => surah.id === id))
    .filter((surah): surah is SurahRow => Boolean(surah))
    .slice(0, 3)

  return (
    <Screen>
      <AppHeader title={t('browse.title')} back />
      <PlaceholderBanner />
      <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('browse.searchPlaceholder')}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {recent.length > 0 && !query ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {t('browse.recent')}
          </h2>
          {recent.map((surah) => (
            <SurahRowItem key={`recent-${surah.id}`} surah={surah} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {t('browse.all')}
        </h2>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('browse.noMatches')}</p>
        ) : (
          filtered.map((surah) => <SurahRowItem key={surah.id} surah={surah} />)
        )}
      </section>
    </Screen>
  )
}

function SurahRowItem({ surah }: { surah: SurahRow }) {
  const { t } = useApp()
  return (
    <Link
      href={`/browse/section/?surah=${surah.id}`}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
    >
      <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {surah.id}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium text-foreground">{surah.name_latin}</span>
        <span className="truncate text-sm text-muted-foreground">
          {surah.name_english} · {surah.verses_count} {t('common.verses')}
        </span>
      </span>
      <span className="shrink-0 font-arabic text-xl text-muted-foreground">{surah.name_arabic}</span>
    </Link>
  )
}
