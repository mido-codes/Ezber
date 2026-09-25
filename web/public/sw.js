/* Ezber service worker: app shell + downloaded content, offline first. */
/* eslint-disable no-restricted-globals */

const VERSION = 'v1'
const SHELL_CACHE = `ezber-shell-${VERSION}`
const RUNTIME_CACHE = `ezber-runtime-${VERSION}`
const AUDIO_CACHE = 'ezber-audio-v1'

const SHELL_URLS = [
  '/',
  '/browse/',
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
      await Promise.allSettled(
        SHELL_URLS.map(async (url) => {
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

  // Content bundle: stale-while-revalidate so updates arrive without blocking.
  if (url.origin === self.location.origin && url.pathname.startsWith('/content/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await cache.match(request)
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) await cache.put(request, response.clone())
            return response
          })
          .catch(() => cached)
        return cached || network
      })(),
    )
    return
  }

  // Same-origin static assets: cache-first with runtime fill.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE)
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response.ok && (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/'))) {
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
