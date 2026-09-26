'use client'

import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/design-system/button'
import { Card } from '@/components/design-system/card'
import { useApp } from '@/lib/app/app-context'

/** Per-view loading placeholder: a quiet card with a spinner. */
export function LoadingBlock({ message }: { message: string }) {
  return (
    <Card className="flex items-center gap-3">
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </Card>
  )
}

/** Per-view error state with a real retry affordance. */
export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  const { t } = useApp()
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <p className="text-sm leading-relaxed text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button tone="outline" size="sm" onClick={onRetry} className="self-start">
          {t('common.retry')}
        </Button>
      ) : null}
    </Card>
  )
}

export function PlaceholderReadingNote() {
  const { t } = useApp()
  return (
    <p className="rounded-2xl border border-border bg-secondary px-4 py-2 text-xs leading-relaxed text-secondary-foreground">
      {t('player.placeholderReading')}
    </p>
  )
}
