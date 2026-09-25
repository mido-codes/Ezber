'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/** Tiny data loader with stale-result protection. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], initial?: T) {
  const [data, setData] = useState<T | undefined>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(0)

  useEffect(() => {
    const token = ++tokenRef.current
    setLoading(true)
    loader()
      .then((value) => {
        if (token !== tokenRef.current) return
        setData(value)
        setError(null)
      })
      .catch((loadError) => {
        if (token !== tokenRef.current) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        if (token === tokenRef.current) setLoading(false)
      })
    // The loader is intentionally keyed by the caller-provided deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}

export function useQueryParam(name: string): string | null {
  const params = useSearchParams()
  return params?.get(name) ?? null
}

export function useNumberQueryParam(name: string, fallback: number): number {
  const value = useQueryParam(name)
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
