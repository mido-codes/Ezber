#!/usr/bin/env node
/**
 * Builds the committed grouped-content fixture **from the real pipeline export**
 * so tests and local browser runs exercise the exact shapes the exporter
 * produces (columnar tables, `files` inventory, per-surah ayahs/
 * transliteration_rows/words, per-reciter/surah segments).
 *
 * Usage:
 *   node scripts/build-fixture.mjs [--export <dir>] [--install]
 *
 * --export defaults to EZBER_CONTENT_EXPORT or ../content-pipeline/build/web.
 * --install also copies the fixture to public/content/ (what
 * `npm run content:fixture` does). Payload files are copied verbatim; only
 * index.json is trimmed to the fixture's surahs/reciters so the committed size
 * stays small.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const exportDir = resolve(
  argument('--export') ??
    process.env.EZBER_CONTENT_EXPORT ??
    join(webRoot, '..', 'content-pipeline', 'build', 'web'),
)
const install = process.argv.includes('--install')

if (!existsSync(join(exportDir, 'index.json'))) {
  console.error(`No pipeline export at ${exportDir}. Run \`make web\` first or pass --export.`)
  process.exit(1)
}

/** Deterministic JSON: object keys sorted, compact output. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function readJson(relative) {
  return JSON.parse(readFileSync(join(exportDir, relative), 'utf8'))
}

function copy(relative, targetDir) {
  const target = join(targetDir, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, readFileSync(join(exportDir, relative)))
}

function writeJson(relative, value, targetDir) {
  const target = join(targetDir, relative)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${stableStringify(value)}\n`)
}

const realIndex = readJson('index.json')
if (realIndex.layout !== 'grouped') {
  console.error(`Export at ${exportDir} is not a grouped export (layout=${realIndex.layout}).`)
  process.exit(1)
}

const SURAH_IDS = [1, 55, 67, 112, 113, 114]
const RECITER_IDS = [1, 2]

const surahsTable = realIndex.surahs // keep the whole 114-surah catalogue
const recitersTable = realIndex.reciters // keep the whole catalogue (small)

const includedPaths = new Set()
for (const surahId of SURAH_IDS) includedPaths.add(`surahs/${surahId}.json`)
for (const reciterId of RECITER_IDS) {
  for (const surahId of SURAH_IDS) includedPaths.add(`segments/${reciterId}/${surahId}.json`)
}
for (const file of realIndex.files) {
  if (file.kind !== 'surah' && file.kind !== 'segments') includedPaths.add(file.path)
}
const files = realIndex.files.filter((file) => includedPaths.has(file.path))

const segmentRows = files
  .filter((file) => file.kind === 'segments')
  .reduce((total, file) => total + (file.rows ?? 0), 0)

// Sum the included surah docs' ayah/word rows from the payloads themselves.
let ayahCount = 0
let wordCount = 0
for (const surahId of SURAH_IDS) {
  const document = readJson(`surahs/${surahId}.json`)
  ayahCount += document.ayahs?.rows?.length ?? 0
  wordCount += document.words?.rows?.length ?? 0
}

const counts = {
  surahs: realIndex.counts.surahs,
  reciters: realIndex.counts.reciters,
  ayahs: ayahCount,
  words: wordCount,
  segments: segmentRows,
  translations: 0,
  transliterations: realIndex.counts.transliterations ?? 0,
  audio_files: 0,
}

const bundleDigest = `fixture:${createHash('sha256')
  .update(stableStringify(files))
  .digest('hex')
  .slice(0, 16)}`

const index = {
  ...realIndex,
  surahs: surahsTable,
  reciters: recitersTable,
  files,
  counts,
  bundle_digest: bundleDigest,
  generated_by: { name: 'ezber-web-fixture', note: `trimmed from ${exportDir}` },
}

const target = join(webRoot, 'fixtures', 'content')
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

copy('TANZIL-NOTICE.txt', target)
copy('audio-files.json', target)
copy('licenses.json', target)
copy('translations.json', target)
copy('transliterations.json', target)
for (const surahId of SURAH_IDS) copy(`surahs/${surahId}.json`, target)
for (const reciterId of RECITER_IDS) {
  for (const surahId of SURAH_IDS) copy(`segments/${reciterId}/${surahId}.json`, target)
}
writeJson('index.json', index, target)

console.log(
  `fixture written: ${bundleDigest} (${SURAH_IDS.length} surahs, ${ayahCount} ayahs, ${wordCount} words, ${segmentRows} segment rows)`,
)

if (install) {
  const publicTarget = join(webRoot, 'public', 'content')
  rmSync(publicTarget, { recursive: true, force: true })
  cpSync(target, publicTarget, { recursive: true })
  console.log(`fixture installed: ${publicTarget}`)
}
