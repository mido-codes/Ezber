#!/usr/bin/env node
/**
 * Post-build step for the service worker: writes out/precache-manifest.json
 * listing every hashed Next.js asset (and the local fonts) so the service
 * worker can cache the whole app shell on install. Run by `npm run build`.
 */
import { createHash } from 'node:crypto'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(webRoot, 'out')

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const roots = [
  ['_next/static', ''],
  ['fonts', ''],
  ['icons', ''],
]
const assets = []
for (const [root, prefix] of roots) {
  const dir = join(outDir, root)
  try {
    for (const file of walk(dir)) {
      assets.push(`/${prefix}${relative(outDir, file).split(/[\\/]/).join('/')}`)
    }
  } catch {
    // Optional directory.
  }
}
for (const file of ['/manifest.webmanifest', '/favicon.ico']) {
  try {
    statSync(join(outDir, file.replace(/^\//, '')))
    assets.push(file)
  } catch {
    // Optional file.
  }
}
assets.sort()

const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12)
writeFileSync(
  join(outDir, 'precache-manifest.json'),
  `${JSON.stringify({ version, assets }, null, 2)}\n`,
)
console.log(`precache manifest: ${assets.length} assets (${version})`)
