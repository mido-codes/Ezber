/* Ezber service worker: app shell + downloaded content, offline first. */
/* eslint-disable no-restricted-globals */

const VERSION = 'v4'
const SHELL_CACHE = `ezber-shell-${VERSION}`
const RUNTIME_CACHE = `ezber-runtime-${VERSION}`
const AUDIO_CACHE = 'ezber-audio-v1'

const SHELL_URLS = [
  '/',
  '/browse/',
  '/browse/section/',
  '/builder/',
  '/presets/',
  '/player/',
  '/reciters/',
  '/progress/',
  '/progress/verse/',
  '/notes/',
  '/settings/',
  '/credits/',
  '/welcome/',
  '/offline/',
  '/manifest.webmanifest',
  '/icons/ezber-icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const urls = [...SHELL_URLS]
      // The generated manifest lists the hashed Next.js chunks and fonts, so
      // every route's HTML can hydrate offline.
      try {
        const response = await fetch('/precache-manifest.json', { cache: 'reload' })
        if (response.ok) {
          const manifest = await response.json()
          if (Array.isArray(manifest.assets)) urls.push(...manifest.assets)
        }
      } catch {
        // Development builds have no manifest; the route shells still work.
      }
      await Promise.allSettled(
        urls.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' })
            if (response.ok) await cache.put(url, response)
          } catch {
            // A missing shell URL must not fail the whole install.
          }
        }),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith('ezber-') &&
              name !== SHELL_CACHE &&
              name !== RUNTIME_CACHE &&
              name !== AUDIO_CACHE,
          )
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

function isAudioRequest(url) {
  return /\.(mp3|m4a|ogg|opus|wav|aac)(\?|$)/i.test(url.pathname)
}

/** Bound a network attempt so an offline device fails over to cache quickly. */
async function fetchWithTimeout(input, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...(init ?? {}), signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function matchAnyCache(request, names) {
  for (const name of names) {
    const cache = await caches.open(name)
    const hit = await cache.match(request)
    if (hit) return hit
  }
  return undefined
}

async function matchAudio(url) {
  const audio = await caches.open(AUDIO_CACHE)
  const hit = await audio.match(url.href)
  if (hit) return hit
  const shell = await caches.open(SHELL_CACHE)
  return shell.match(url.href)
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Downloaded audio (from any origin) is served from the audio cache first.
  if (isAudioRequest(url)) {
    event.respondWith(
      (async () => {
        const cached = await matchAudio(url)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok && url.origin === self.location.origin) {
            const runtime = await caches.open(RUNTIME_CACHE)
            await runtime.put(request, response.clone())
          }
          return response
        } catch (error) {
          const offline = await caches.open(SHELL_CACHE)
          const fallback = await offline.match('/offline/')
          if (fallback) return fallback
          throw error
        }
      })(),
    )
    return
  }

  // Navigations: cached shell first, then network, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const shell = await caches.open(SHELL_CACHE)
        const cached = (await shell.match(request)) || (await shell.match(url.pathname))
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok) await shell.put(url.pathname, response.clone())
          return response
        } catch (error) {
          const fallback = (await shell.match('/')) || (await shell.match('/offline/'))
          if (fallback) return fallback
          throw error
        }
      })(),
    )
    return
  }

  // Content bundle: cached copy first, then a bounded network refresh.
  if (url.origin === self.location.origin && url.pathname.startsWith('/content/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await cache.match(request)
        if (cached) {
          // Refresh in the background without delaying the response.
          fetchWithTimeout(request, {}, 15000)
            .then(async (response) => {
              if (response.ok) await cache.put(request, response.clone())
            })
            .catch(() => {})
          return cached
        }
        try {
          const response = await fetchWithTimeout(request, {}, 15000)
          if (response.ok) await cache.put(request, response.clone())
          return response
        } catch (error) {
          const shellHit = await matchAnyCache(request, [SHELL_CACHE])
          if (shellHit) return shellHit
          throw error
        }
      })(),
    )
    return
  }

  // Same-origin assets: cached shell first (precached chunks hydrate offline),
  // then the runtime cache, then a bounded network fill.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await matchAnyCache(request, [SHELL_CACHE, RUNTIME_CACHE])
        if (cached) return cached
        try {
          const response = await fetchWithTimeout(request, {}, 8000)
          if (response.ok && (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/'))) {
            const cache = await caches.open(RUNTIME_CACHE)
            await cache.put(request, response.clone())
          }
          return response
        } catch (error) {
          const shell = await caches.open(SHELL_CACHE)
          const fallback = await shell.match(request)
          if (fallback) return fallback
          throw error
        }
      })(),
    )
  }
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
  if (data.type === 'VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION })
  }
})
