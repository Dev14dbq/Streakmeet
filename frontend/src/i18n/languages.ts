export interface AppLanguage {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
}

/** 15 supported locales (12+ as requested) */
export const SUPPORTED_LANGUAGES: AppLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr' },
]

export const DEFAULT_LANGUAGE = 'en'
export const FALLBACK_LANGUAGE = 'en'
export const LOCALE_STORAGE_KEY = 'streakmeet_locale'

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

export function normalizeLocale(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_LANGUAGE
  const base = raw.toLowerCase().split('-')[0]!
  return SUPPORTED_LANGUAGE_CODES.includes(base) ? base : DEFAULT_LANGUAGE
}

export function getLanguageMeta(code: string): AppLanguage {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0]!
}
