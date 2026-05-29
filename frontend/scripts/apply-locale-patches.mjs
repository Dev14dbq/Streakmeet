/**
 * Deep-merge manual translation patches into locale files.
 * Run: node scripts/apply-locale-patches.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { patches } from './locale-patches/new-keys.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/i18n/locales')

function merge(base, override) {
  const out = structuredClone(base)
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object') {
      out[k] = merge(out[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}

for (const [code, patch] of Object.entries(patches)) {
  const path = join(localesDir, `${code}.json`)
  const current = JSON.parse(readFileSync(path, 'utf8'))
  const merged = merge(current, patch)
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
  console.log(`Patched ${code}.json`)
}

console.log('Done.')
