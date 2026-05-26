import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  SUPPORTED_LANGUAGE_CODES,
} from './languages'

import en from './locales/en.json'
import ru from './locales/ru.json'
import es from './locales/es.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import pt from './locales/pt.json'
import it from './locales/it.json'
import ko from './locales/ko.json'
import ar from './locales/ar.json'
import hi from './locales/hi.json'
import tr from './locales/tr.json'
import pl from './locales/pl.json'
import id from './locales/id.json'

const resources = {
  en: { translation: en },
  ru: { translation: ru },
  es: { translation: es },
  zh: { translation: zh },
  ja: { translation: ja },
  de: { translation: de },
  fr: { translation: fr },
  pt: { translation: pt },
  it: { translation: it },
  ko: { translation: ko },
  ar: { translation: ar },
  hi: { translation: hi },
  tr: { translation: tr },
  pl: { translation: pl },
  id: { translation: id },
} as const

function applyDocumentLanguage(lng: string) {
  const code = normalizeLocale(lng)
  document.documentElement.lang = code
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr'
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  })

i18n.on('languageChanged', applyDocumentLanguage)
applyDocumentLanguage(i18n.language || DEFAULT_LANGUAGE)

export function changeAppLanguage(code: string) {
  const normalized = normalizeLocale(code)
  localStorage.setItem(LOCALE_STORAGE_KEY, normalized)
  void i18n.changeLanguage(normalized)
  return normalized
}

export function getCurrentLocale(): string {
  return normalizeLocale(i18n.language)
}

export default i18n
