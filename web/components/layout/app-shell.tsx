'use client'

import { ChevronLeft, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useApp } from '@/lib/app/app-context'
import { cn } from '@/lib/utils'

/** Standard screen container: phone-width column, generous bottom nav space. */
export function Screen({
  children,
  className,
  withTabBar = true,
}: {
  children: ReactNode
  className?: string
  withTabBar?: boolean
}) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 pt-3',
        withTabBar ? 'pb-32' : 'pb-10',
        className,
      )}
    >
      {children}
    </main>
  )
}

export function AppHeader({
  title,
  eyebrow,
  back = false,
  actions,
  className,
}: {
  title?: string
  eyebrow?: string
  back?: boolean
  actions?: ReactNode
  className?: string
}) {
  const router = useRouter()
  return (
    <header className={cn('flex items-center justify-between gap-3 pt-2', className)}>
      <div className="flex min-w-0 items-center gap-1">
        {back ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          {title ? <h1 className="truncate text-xl font-semibold text-foreground">{title}</h1> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function AppSplash({ message }: { message?: string }) {
  const { t } = useApp()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <img src="/icons/ezber-icon.svg" alt="" className="size-16 rounded-2xl" />
      <p className="text-xl font-semibold text-foreground">{t('app.name')}</p>
      <p className="text-sm text-muted-foreground">{message ?? t('common.loading')}</p>
    </div>
  )
}

export function AppError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-xl font-semibold text-foreground">Ezber could not start</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <p className="max-w-md text-xs text-muted-foreground">
        Private browsing can block local storage. Try a normal window and reload.
      </p>
    </div>
  )
}

export function PlaceholderBanner() {
  const { summary, t } = useApp()
  if (!summary || summary.mode !== 'placeholder') return null
  const problem = summary.problem
  return (
    <div
      className={
        problem
          ? 'flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs leading-relaxed text-destructive'
          : 'flex items-start gap-2 rounded-2xl border border-border bg-secondary px-4 py-3 text-xs leading-relaxed text-secondary-foreground'
      }
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{problem?.message ?? t('settings.contentPending')}</p>
    </div>
  )
}
