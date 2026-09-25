import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Action styles copied from the kit's buttons-showcase.tsx. The kit's
 * `ui/button.tsx` (shadcn/Base UI) is not used by the design-system screens,
 * so the hand-rolled tones are the source of truth.
 */
export type ButtonTone = 'primary' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'md' | 'lg' | 'sm'

export function buttonClasses(tone: ButtonTone = 'primary', size: ButtonSize = 'md', expand = false) {
  const tones: Record<ButtonTone, string> = {
    primary:
      'bg-primary text-primary-foreground font-semibold transition-opacity hover:opacity-90 active:opacity-80',
    outline:
      'border border-border bg-card text-foreground font-medium transition-colors hover:bg-muted',
    ghost: 'text-muted-foreground font-medium transition-colors hover:text-foreground',
    destructive:
      'bg-destructive/10 text-destructive font-medium transition-colors hover:bg-destructive/20',
  }
  const sizes: Record<ButtonSize, string> = {
    sm: 'min-h-9 gap-1.5 rounded-full px-4 py-2 text-sm',
    md: 'min-h-11 gap-2 rounded-full px-6 py-3 text-sm',
    lg: 'min-h-16 gap-2 rounded-3xl px-6 py-5 text-base',
  }
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap disabled:pointer-events-none disabled:opacity-50',
    tones[tone],
    sizes[size],
    expand && 'w-full',
  )
}

export function Button({
  tone = 'primary',
  size = 'md',
  expand = false,
  className,
  children,
  ...props
}: {
  tone?: ButtonTone
  size?: ButtonSize
  expand?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button type="button" className={cn(buttonClasses(tone, size, expand), className)} {...props}>
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className,
  active = false,
  ...props
}: {
  label: string
  children: ReactNode
  className?: string
  active?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
