'use client'

/** Keeps the screen awake during a study session; a no-op where unsupported. */
export async function requestWakeLock(): Promise<() => void> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return () => {}
  }
  try {
    const sentinel = await navigator.wakeLock.request('screen')
    return () => {
      void sentinel.release().catch(() => {})
    }
  } catch {
    return () => {}
  }
}
