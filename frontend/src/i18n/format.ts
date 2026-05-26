import i18n from './index'

export function getIntlLocale(): string {
  const code = i18n.language || 'en'
  const map: Record<string, string> = {
    en: 'en-US',
    ru: 'ru-RU',
    es: 'es-ES',
    zh: 'zh-CN',
    ja: 'ja-JP',
    de: 'de-DE',
    fr: 'fr-FR',
    pt: 'pt-BR',
    it: 'it-IT',
    ko: 'ko-KR',
    ar: 'ar-SA',
    hi: 'hi-IN',
    tr: 'tr-TR',
    pl: 'pl-PL',
    id: 'id-ID',
  }
  return map[code] ?? 'en-US'
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(getIntlLocale(), options)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(getIntlLocale())
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(getIntlLocale(), {
    month: 'long',
    year: 'numeric',
  })
}

export function formatRelativeTime(iso: string | Date): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso
  const diffSec = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000))
  if (diffSec < 15) return i18n.t('time.justNow')
  if (diffSec < 60) return i18n.t('time.secondsAgo', { count: diffSec })
  const min = Math.floor(diffSec / 60)
  if (min < 60) return i18n.t('time.minutesAgo', { count: min })
  const h = Math.floor(min / 60)
  return i18n.t('time.hoursAgo', { count: h })
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return i18n.t('distance.meters', { count: Math.round(meters) })
  if (meters < 10_000) return i18n.t('distance.kmDecimal', { value: (meters / 1000).toFixed(1) })
  return i18n.t('distance.km', { count: Math.round(meters / 1000) })
}

export function streakDaysLabel(count: number): string {
  return i18n.t('streak.days', { count })
}
