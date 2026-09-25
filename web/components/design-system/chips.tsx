import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type VerseState = 'new' | 'learning' | 'review' | 'memorized'

/**
 * One hue, four depths — the kit's verse-state treatment, mapped onto the
 * schema's memorization_state values.
 */
const STATE_STYLES: Record<VerseState, string> = {
  new: 'border border-border bg-transparent text-muted-foreground',
  learning: 'bg-primary/20 text-foreground',
  review: 'bg-primary/55 text-primary-foreground',
  memorized: 'bg-primary text-primary-foreground',
}

export function VerseStateChip({
  state,
  label,
  className,
}: {
  state: VerseState
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium',
        STATE_STYLES[state],
        className,
      )}
    >
      {label}
    </span>
  )
}

/** The honey cue is reserved for the active verse; never used for actions. */
export function AccentChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function MetaChip({
  children,
  active = false,
  className,
}: {
  children: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-4 py-2 text-sm',
        active
          ? 'bg-primary font-medium text-primary-foreground'
          : 'border border-border text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
