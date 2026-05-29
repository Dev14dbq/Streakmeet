/**
 * Validates locale files against en.json.
 * Run: node scripts/validate-locales.mjs
 */
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/i18n/locales')

const ALLOW_SAME = new Set([
  'app.name',
  'app.version',
  'common.qr',
  'camera.error',
  'camera.modeMeet',
  'errors.generic',
  'streak.pingPing',
  'streak.spam',
  'nav.memories',
])

function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else {
      out[key] = v
    }
  }
  return out
}

const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'))
const enFlat = flatten(en)
let failed = false

for (const file of readdirSync(localesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const code = file.replace('.json', '')
  const loc = JSON.parse(readFileSync(join(localesDir, file), 'utf8'))
  const locFlat = flatten(loc)
  const missing = Object.keys(enFlat).filter((k) => !(k in locFlat))
  const same = Object.keys(enFlat).filter((k) => locFlat[k] === enFlat[k] && !ALLOW_SAME.has(k))
  const bad = Object.entries(locFlat).filter(
    ([, v]) => typeof v === 'string' && (v.includes('MYMEMORY') || v.includes('Too Many Requests'))
  )

  if (missing.length || bad.length) {
    failed = true
    console.error(`${code}: missing=${missing.length} corrupt=${bad.length}`)
    if (missing.length) console.error('  missing:', missing.slice(0, 5).join(', '))
  } else if (same.length > 15) {
    failed = true
    console.warn(`${code}: ${same.length} keys still match English (review)`)
  } else {
    console.log(`${code}: ok (${Object.keys(locFlat).length} keys, ${same.length} en-identical)`)
  }
}

process.exit(failed ? 1 : 0)
