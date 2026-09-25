'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
  format,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label: string
  format?: (value: number) => string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label={`${label}: minus`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        disabled={value <= min}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="min-w-12 text-center text-sm font-semibold tabular-nums text-foreground">
        {format ? format(value) : value}
      </span>
      <button
        type="button"
        aria-label={`${label}: plus`}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        disabled={value >= max}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <span
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block size-5 rounded-full bg-card shadow-sm transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}

export function SegmentedChoice<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full px-4 py-2 text-sm transition-colors',
            option.value === value
              ? 'bg-primary font-medium text-primary-foreground'
              : 'border border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
