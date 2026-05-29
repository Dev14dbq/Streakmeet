/**
 * Fills all locale JSON files from en.json + machine translation (MyMemory).
 * Preserves {{placeholders}}, @mentions, and brand name StreakMeet.
 *
 * Run: node scripts/translate-all-locales.mjs
 * Optional: node scripts/translate-all-locales.mjs ru es  (only listed langs)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '../src/i18n/locales')

const MYMEMORY_LANG = {
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

const ALL_TARGETS = Object.keys(MYMEMORY_LANG)
const DELAY_MS = 400
const cache = new Map()

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

/** Split text into translatable segments and placeholders */
function splitPlaceholders(text) {
  const re = /(\{\{[^}]+\}\}|@[a-zA-Z0-9_]+|StreakMeet)/g
  const parts = text.split(re).filter((p) => p !== '')
  return parts
}

async function translateSegment(text, targetLang) {
  const trimmed = text.trim()
  if (!trimmed) return text
  if (/^[\d\s\.,!?…\-–—«»%:;()]+$/.test(trimmed)) return text

  const cacheKey = `${targetLang}:${trimmed}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const langpair = `en|${targetLang}`
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${langpair}`

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.quotaFinished) {
        console.warn('MyMemory quota finished, waiting 60s...')
        await sleep(60_000)
        continue
      }
      const translated = data.responseData?.translatedText
      if (translated) {
        cache.set(cacheKey, translated)
        return translated
      }
    } catch (e) {
      console.warn('translate error', e.message)
    }
    await sleep(2000 * (attempt + 1))
  }
  return text
}

async function translateText(text, targetLang) {
  const parts = splitPlaceholders(text)
  const out = []
  for (const part of parts) {
    if (/^\{\{[^}]+\}\}$/.test(part) || /^@[a-zA-Z0-9_]+$/.test(part) || part === 'StreakMeet') {
      out.push(part)
    } else {
      out.push(await translateSegment(part, targetLang))
      await sleep(DELAY_MS)
    }
  }
  return out.join('')
}

async function translateLocale(lang, enFlat) {
  const myLang = MYMEMORY_LANG[lang]
  const path = join(localesDir, `${lang}.json`)
  let existingFlat = {}
  try {
    existingFlat = flatten(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    /* new file */
  }

  const result = { ...existingFlat }
  const keys = Object.keys(enFlat)
  let done = 0
  let translated = 0

  for (const key of keys) {
    const enVal = enFlat[key]
    const cur = result[key]

    const needsWork = cur === undefined || cur === enVal
    if (!needsWork) {
      done++
      continue
    }

    result[key] = await translateText(enVal, myLang)
    translated++
    done++
    if (done % 20 === 0) {
      console.log(`  [${lang}] ${done}/${keys.length} (${translated} translated)`)
    }
  }

  writeFileSync(path, JSON.stringify(unflatten(result), null, 2) + '\n')
  console.log(`Wrote ${lang}.json — ${translated} strings translated, ${keys.length} total keys`)
}

async function main() {
  const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'))
  const enFlat = flatten(en)
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : ALL_TARGETS

  mkdirSync(localesDir, { recursive: true })
  console.log(`Translating ${targets.length} locales, ${Object.keys(enFlat).length} keys each…`)

  for (const lang of targets) {
    if (!MYMEMORY_LANG[lang]) {
      console.warn(`Unknown lang: ${lang}`)
      continue
    }
    console.log(`\n=== ${lang} ===`)
    await translateLocale(lang, enFlat)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
