import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Card from the kit: 32pt continuous radius, hairline border, card surface. */
export function Card({
  className,
  children,
  padding = 'md',
  ...props
}: {
  padding?: 'sm' | 'md' | 'lg' | 'none'
} & HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  }
  return (
    <div className={cn('rounded-2xl border border-border bg-card', paddings[padding], className)} {...props}>
      {children}
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {eyebrow ? (
        <span className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-balance text-2xl font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-4 p-8 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{message}</p>
      {action}
    </Card>
  )
}
