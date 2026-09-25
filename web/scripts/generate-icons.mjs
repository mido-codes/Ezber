#!/usr/bin/env node
/**
 * Regenerates the PWA icon set from public/icons/ezber-icon.svg.
 *
 * Requires ImageMagick (`magick`, falling back to `convert`). The outputs are
 * committed, so this script is only needed when the mark changes.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const icons = join(root, 'public', 'icons')
const svg = join(icons, 'ezber-icon.svg')
const background = '#24483D'

const binary = ['magick', 'convert'].find((candidate) => {
  try {
    execFileSync('which', [candidate], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})

if (!binary) {
  console.error('ImageMagick is required to regenerate the icons (magick or convert).')
  process.exit(1)
}
if (!existsSync(svg)) {
  console.error(`Missing ${svg}`)
  process.exit(1)
}

const run = (args) => {
  execFileSync(binary, args, { stdio: 'inherit' })
  console.log(`${binary} ${args.join(' ')}`)
}

run([svg, '-background', 'none', '-resize', '192x192', join(icons, 'icon-192.png')])
run([svg, '-background', 'none', '-resize', '512x512', join(icons, 'icon-512.png')])
run([svg, '-background', 'none', '-resize', '32x32', join(icons, 'icon-32.png')])
run([
  svg,
  '-background',
  background,
  '-resize',
  '384x384',
  '-gravity',
  'center',
  '-extent',
  '512x512',
  join(icons, 'icon-maskable-512.png'),
])
run([
  svg,
  '-background',
  background,
  '-resize',
  '144x144',
  '-gravity',
  'center',
  '-extent',
  '180x180',
  join(icons, 'apple-touch-icon.png'),
])
run([
  join(icons, 'icon-32.png'),
  '-define',
  'icon:auto-resize=32,16',
  join(icons, 'favicon.ico'),
])
run(['-background', 'none', svg, '-resize', '1024x1024', join(icons, 'icon-1024.png')])
