'use client'

import { Pencil, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button, buttonClasses } from '@/components/design-system/button'
import { Card, EmptyState } from '@/components/design-system/card'
import { AppError, AppHeader, AppSplash, Screen } from '@/components/layout/app-shell'
import { useApp } from '@/lib/app/app-context'
import { useAsync } from '@/lib/app/use-async'
import type { NoteRow } from '@/lib/user/types'
import { formatRelativeDay } from '@/lib/utils'
import { isValidVerseKey } from '@/lib/verses'

export default function NotesPage() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [newVerseKey, setNewVerseKey] = useState('')
  const [newBody, setNewBody] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')

  const { data, loading } = useAsync(async () => {
    if (!app.user || !app.content) return null
    const notes = await app.user.listNotes()
    const surahs = await app.content.surahs()
    return { notes, surahMap: new Map(surahs.map((surah) => [surah.id, surah])) }
  }, [app.ready, app.revision, query])

  const filtered = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return data.notes
    return data.notes.filter((note) =>
      `${note.body_md} ${note.verse_key}`.toLowerCase().includes(needle),
    )
  }, [data, query])

  if (app.error) return <AppError message={app.error} />
  if (!app.ready || loading || !data) return <AppSplash message={app.startupMessage} />
  const { t } = app

  const saveNew = async () => {
    if (!app.user || !isValidVerseKey(newVerseKey) || !newBody.trim()) return
    await app.user.saveNote({ verse_key: newVerseKey.trim(), body_md: newBody.trim() })
    setNewVerseKey('')
    setNewBody('')
    setComposing(false)
    app.refresh()
  }

  return (
    <Screen>
      <AppHeader
        title={t('notes.title')}
        actions={
          <Button tone="outline" size="sm" onClick={() => setComposing((value) => !value)}>
            {t('notes.newNote')}
          </Button>
        }
      />

      {composing ? (
        <Card className="flex flex-col gap-3">
          <input
            value={newVerseKey}
            onChange={(event) => setNewVerseKey(event.target.value)}
            placeholder="55:1"
            inputMode="numeric"
            className="w-full rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <textarea
            value={newBody}
            onChange={(event) => setNewBody(event.target.value)}
            rows={3}
            placeholder={t('notes.bodyPlaceholder', { key: newVerseKey || '55:1' })}
            className="w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClasses('primary', 'md', false)}
              disabled={!isValidVerseKey(newVerseKey) || !newBody.trim()}
              onClick={() => void saveNew()}
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              className={buttonClasses('ghost', 'md', false)}
              onClick={() => setComposing(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </Card>
      ) : null}

      <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('notes.searchPlaceholder')}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {filtered.length === 0 ? (
        <EmptyState title={t('notes.emptyTitle')} message={t('notes.emptyBody')} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((note: NoteRow) => {
            const surahId = Number(note.verse_key.split(':')[0])
            const surah = data.surahMap.get(surahId)
            return (
              <Card key={note.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {surah ? `${surah.name_latin} · ` : ''}
                    {note.verse_key}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('notes.updated', { when: formatRelativeDay(note.updated_at ?? note.created_at) })}
                  </span>
                </div>
                {editing === note.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={buttonClasses('primary', 'sm', false)}
                        onClick={async () => {
                          if (!app.user || note.id === undefined) return
                          await app.user.updateNote(note.id, editBody)
                          setEditing(null)
                          app.refresh()
                        }}
                      >
                        {t('common.save')}
                      </button>
                      <button
                        type="button"
                        className={buttonClasses('ghost', 'sm', false)}
                        onClick={() => setEditing(null)}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-foreground">{note.body_md}</p>
                )}
                <div className="flex items-center gap-3 border-t border-border/60 pt-2">
                  <Link
                    href={`/progress/verse/?key=${note.verse_key}`}
                    className="text-xs font-medium text-primary"
                  >
                    {t('notes.jumpToVerse')}
                  </Link>
                  <button
                    type="button"
                    aria-label={t('common.edit')}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditing(note.id ?? null)
                      setEditBody(note.body_md)
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!app.user || note.id === undefined) return
                      if (!window.confirm(t('notes.deleteBody'))) return
                      await app.user.deleteNote(note.id)
                      app.refresh()
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
