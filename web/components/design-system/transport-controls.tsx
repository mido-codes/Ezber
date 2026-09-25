'use client'

import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Five-button transport from the kit's transport-controls.tsx, wired to the
 * drill engine: prev/next verse, prev/next repeat, large primary play/pause.
 */
export function TransportControls({
  playing,
  onToggle,
  onPrevVerse,
  onNextVerse,
  onPrevRepeat,
  onNextRepeat,
  compact = false,
  disabled = false,
  labels,
  className,
}: {
  playing: boolean
  onToggle: () => void
  onPrevVerse: () => void
  onNextVerse: () => void
  onPrevRepeat: () => void
  onNextRepeat: () => void
  compact?: boolean
  disabled?: boolean
  labels: {
    play: string
    pause: string
    prevVerse: string
    nextVerse: string
    prevRepeat: string
    nextRepeat: string
  }
  className?: string
}) {
  const size = compact ? 'size-11' : 'size-14'
  const icon = compact ? 'size-5' : 'size-6'
  const buttonBase =
    'inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-40'
  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      <button
        type="button"
        aria-label={labels.prevVerse}
        onClick={onPrevVerse}
        disabled={disabled}
        className={cn(buttonBase, size, 'text-foreground/80 hover:bg-muted')}
      >
        <SkipBack className={icon} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.prevRepeat}
        onClick={onPrevRepeat}
        disabled={disabled}
        className={cn(buttonBase, size, 'text-foreground/60 hover:bg-muted')}
      >
        <Repeat className={compact ? 'size-4' : 'size-5'} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={playing ? labels.pause : labels.play}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          buttonBase,
          'bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90',
          compact ? 'size-16' : 'size-20',
        )}
      >
        {playing ? (
          <Pause className={compact ? 'size-7' : 'size-9'} aria-hidden />
        ) : (
          <Play className={compact ? 'size-7' : 'size-9'} aria-hidden />
        )}
      </button>
      <button
        type="button"
        aria-label={labels.nextRepeat}
        onClick={onNextRepeat}
        disabled={disabled}
        className={cn(buttonBase, size, 'text-foreground/60 hover:bg-muted')}
      >
        <Repeat className={cn(compact ? 'size-4' : 'size-5', 'scale-x-[-1]')} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={labels.nextVerse}
        onClick={onNextVerse}
        disabled={disabled}
        className={cn(buttonBase, size, 'text-foreground/80 hover:bg-muted')}
      >
        <SkipForward className={icon} aria-hidden />
      </button>
    </div>
  )
}
