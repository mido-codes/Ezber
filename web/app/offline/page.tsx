import Link from 'next/link'
import { buttonClasses } from '@/components/design-system/button'

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <img src="/icons/ezber-icon.svg" alt="" className="size-16 rounded-2xl" />
      <h1 className="text-2xl font-semibold text-foreground">Offline</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        This screen is not cached yet. Your presets, progress and downloaded surahs still work
        offline.
      </p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        Back to home
      </Link>
    </main>
  )
}
