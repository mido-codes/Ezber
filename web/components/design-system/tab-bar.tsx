'use client'

import { BarChart3, Home, ListMusic, NotebookPen, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '@/lib/app/app-context'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'nav.home', href: '/', icon: Home, match: (path: string) => path === '/' },
  {
    key: 'nav.library',
    href: '/presets/',
    icon: ListMusic,
    match: (path: string) => path.startsWith('/presets') || path.startsWith('/browse') || path.startsWith('/builder'),
  },
  { key: 'nav.progress', href: '/progress/', icon: BarChart3, match: (path: string) => path.startsWith('/progress') },
  { key: 'nav.notes', href: '/notes/', icon: NotebookPen, match: (path: string) => path.startsWith('/notes') },
  { key: 'nav.settings', href: '/settings/', icon: Settings, match: (path: string) => path.startsWith('/settings') || path.startsWith('/credits') || path.startsWith('/reciters') },
] as const

/** Floating tab bar from the kit's tab-bar.tsx, with the app's five surfaces. */
export function AppTabBar() {
  const pathname = usePathname() ?? '/'
  const { t } = useApp()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between rounded-3xl border border-border bg-card/95 px-2 py-2 shadow-sm backdrop-blur">
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          const Icon = tab.icon
          return (
            <Link
              key={tab.key}
              href={tab.href}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t(tab.key)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
