#!/usr/bin/env node
/**
 * Copies the content pipeline's web export into web/public/content/ so the app
 * can be integration-tested against the real bundle. See web/CONTENT_BUNDLE.md.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(webRoot, '..', 'content-pipeline', 'build', 'web')
const target = join(webRoot, 'public', 'content')

if (!existsSync(source)) {
  console.error(`No pipeline export at ${source}. Run \`make pipeline\` in the repo first.`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log(`Copied ${source} -> ${target}`)
