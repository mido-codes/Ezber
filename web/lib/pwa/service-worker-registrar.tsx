'use client'

import { useEffect } from 'react'

/** Registers the offline service worker (production builds only). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is best-effort; the app still works online.
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
