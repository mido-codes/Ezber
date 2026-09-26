import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FetchLog {
  urls: string[]
}

const fixturesRoot = join(__dirname, '..', '..', '..', 'fixtures', 'content')

export function fixtureIndex(): { bundle_digest: string; counts: Record<string, number> } {
  return JSON.parse(readFileSync(join(fixturesRoot, 'index.json'), 'utf8')) as {
    bundle_digest: string
    counts: Record<string, number>
  }
}

/**
 * Serves a directory of content files with a fetch-compatible stub. Used both
 * for the committed fixture and for the real pipeline export.
 */
export function fileFetch(
  root: string,
  log: FetchLog = { urls: [] },
  transform?: (pathname: string, body: unknown) => unknown,
): { fetchImpl: typeof fetch; log: FetchLog } {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    log.urls.push(url)
    const pathname = new URL(url, 'http://localhost').pathname
    // URLs are served under /content/; the stub root is that directory.
    const relative = pathname.replace(/^\/+/, '').replace(/^content\//, '')
    const file = join(root, relative)
    if (!existsSync(file)) return new Response('not found', { status: 404 })
    const raw = readFileSync(file, 'utf8')
    if (!transform) {
      return new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const body = transform(pathname, JSON.parse(raw))
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, log }
}

export function fixtureFetch(
  log: FetchLog = { urls: [] },
  transform?: (pathname: string, body: unknown) => unknown,
): { fetchImpl: typeof fetch; log: FetchLog } {
  return fileFetch(fixturesRoot, log, transform)
}

export function notFoundFetch(log: FetchLog = { urls: [] }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    log.urls.push(url)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

/** A fetch stub that answers the given status for the index and 404 elsewhere. */
export function indexFetch(
  status: number,
  body: unknown,
  log: FetchLog = { urls: [] },
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    log.urls.push(url)
    if (url.endsWith('/content/index.json')) {
      if (typeof body === 'string') {
        return new Response(body, { status })
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}
