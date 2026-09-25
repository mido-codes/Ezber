import { cn } from '@/lib/utils'

/** Progress track from the kit: 6pt muted capsule with a primary fill. */
export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  )
}
