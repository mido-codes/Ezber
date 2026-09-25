'use client'

import { Play } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from './button'
import { cn } from '@/lib/utils'

/**
 * Saved-drill row from the kit's preset-card.tsx, extended with the library
 * actions (open, edit, duplicate, delete) the README asks for.
 */
export function PresetCard({
  name,
  meta,
  status,
  emphasized = false,
  href,
  onPlay,
  playLabel,
  actions,
  className,
}: {
  name: string
  meta: string
  status?: string
  emphasized?: boolean
  href?: string
  onPlay?: () => void
  playLabel?: string
  actions?: ReactNode
  className?: string
}) {
  const body = (
    <div className="flex flex-col gap-1">
      <p className="text-base font-medium text-foreground">{name}</p>
      <p className="text-sm text-muted-foreground">{meta}</p>
      {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
    </div>
  )
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        emphasized ? 'border-primary/30 bg-secondary' : 'border-border bg-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {href ? (
          <Link href={href} className="min-w-0 flex-1">
            {body}
          </Link>
        ) : (
          <div className="min-w-0 flex-1">{body}</div>
        )}
        {onPlay ? (
          <button
            type="button"
            aria-label={playLabel ?? `Play ${name}`}
            onClick={onPlay}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Play className="size-4.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {actions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function TextAction({
  onClick,
  children,
  tone = 'muted',
}: {
  onClick: () => void
  children: ReactNode
  tone?: 'muted' | 'destructive'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        buttonClasses('ghost', 'sm', false).replace('text-muted-foreground', ''),
        'px-3 py-1.5 text-xs',
        tone === 'destructive' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
