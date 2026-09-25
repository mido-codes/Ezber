import { cn } from '@/lib/utils'

/**
 * Repeat and section progress, from the kit's progress-indicators.tsx.
 * `RepeatBar` is a 6pt track; `SectionSegments` is one capsule per verse.
 */
export function RepeatBar({
  value,
  max,
  className,
}: {
  value: number
  max: number
  className?: string
}) {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}

export function SectionSegments({
  count,
  active,
  className,
}: {
  count: number
  active: number
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: Math.max(0, count) }).map((_, index) => (
        <span
          key={index}
          className={cn('h-2 flex-1 rounded-full', index < active ? 'bg-primary' : 'bg-muted')}
        />
      ))}
    </div>
  )
}
