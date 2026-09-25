'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppTabBar } from '@/components/design-system/tab-bar'

/** The tab bar stays out of the immersive player and first-run wizard. */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/'
  const immersive = pathname.startsWith('/player') || pathname.startsWith('/welcome')
  return (
    <>
      {children}
      {immersive ? null : <AppTabBar />}
    </>
  )
}
