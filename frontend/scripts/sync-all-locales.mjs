/**
 * Ensures every locale has all keys from en.json.
 * Fills missing or English-identical strings via Google Translate (unofficial API).
 * Preserves {{placeholders}}, @mentions, StreakMeet brand.
 *
 * Run: node scripts/sync-all-locales.mjs
 *      node scripts/sync-all-locales.mjs it ko
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { translate } from '@vitalets/google-translate-api'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/i18n/locales')

const LANG_CODES = {
  ru: 'ru',
  es: 'es',
  zh: 'zh-CN',
  ja: 'ja',
  de: 'de',
  fr: 'fr',
  pt: 'pt',
  it: 'it',
  ko: 'ko',
  ar: 'ar',
  hi: 'hi',
  tr: 'tr',
  pl: 'pl',
  id: 'id',
}

/** Keys that may legitimately match English */
const ALLOW_SAME = new Set([
  'app.name',
  'common.qr',
  'camera.error',
  'camera.modeMeet',
  'errors.generic',
  'streak.pingPing',
])

const DELAY_MS = 300

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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

function unflatten(flat) {
  const root = {}
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.')
    let cur = root
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      if (!(p in cur) || typeof cur[p] !== 'object') cur[p] = {}
      cur = cur[p]
    }
    cur[parts[parts.length - 1]] = value
  }
  return root
}

function isBad(value) {
  if (typeof value !== 'string') return false
  return value.includes('MYMEMORY WARNING') || value.includes('USAGE LIMITS')
}

function splitPlaceholders(text) {
  return text.split(/(\{\{[^}]+\}\}|@[a-zA-Z0-9_]+|StreakMeet)/g).filter((p) => p !== '')
}

async function translateText(text, to) {
  const parts = splitPlaceholders(text)
  const out = []
  for (const part of parts) {
    if (/^\{\{[^}]+\}\}$/.test(part) || /^@[a-zA-Z0-9_]+$/.test(part) || part === 'StreakMeet') {
      out.push(part)
      continue
    }
    const trimmed = part.trim()
    if (!trimmed || /^[\d\s\.,!?…\-–—«»%:;()]+$/.test(trimmed)) {
      out.push(part)
      continue
    }
    const { text: tr } = await translate(part, { from: 'en', to })
    out.push(part.startsWith(' ') ? ' ' + tr : tr)
    await sleep(DELAY_MS)
  }
  return out.join('')
}

async function syncLocale(lang, enFlat) {
  const path = join(localesDir, `${lang}.json`)
  let flat = {}
  try {
    flat = flatten(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    /* empty */
  }

  const to = LANG_CODES[lang]
  let translated = 0
  const keys = Object.keys(enFlat)

  for (const key of keys) {
    const enVal = enFlat[key]
    const cur = flat[key]
    const missing = cur === undefined
    const bad = isBad(cur)
    const same = cur === enVal && !ALLOW_SAME.has(key)

    if (!missing && !bad && !same) continue

    try {
      flat[key] = await translateText(enVal, to)
      translated++
      if (translated % 15 === 0) {
        console.log(`  [${lang}] translated ${translated}…`)
      }
    } catch (e) {
      console.warn(`  [${lang}] skip ${key}: ${e.message}`)
      if (missing) flat[key] = enVal
    }
  }

  writeFileSync(path, JSON.stringify(unflatten(flat), null, 2) + '\n')
  console.log(`Wrote ${lang}.json (${translated} updated, ${keys.length} keys)`)
}

async function main() {
  const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'))
  const enFlat = flatten(en)
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LANG_CODES)

  for (const lang of targets) {
    if (!LANG_CODES[lang]) {
      console.warn(`Unknown: ${lang}`)
      continue
    }
    console.log(`\n=== ${lang} ===`)
    await syncLocale(lang, enFlat)
  }
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
