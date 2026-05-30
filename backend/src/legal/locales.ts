export const LEGAL_LOCALES = [
  'en',
  'ru',
  'es',
  'zh',
  'ja',
  'de',
  'fr',
  'pt',
  'it',
  'ko',
  'ar',
  'hi',
  'tr',
  'pl',
  'id',
] as const

export type LegalLocale = (typeof LEGAL_LOCALES)[number]

export function normalizeLegalLocale(raw: string | undefined): LegalLocale {
  if (!raw) return 'en'
  const base = raw.toLowerCase().split('-')[0]!
  return (LEGAL_LOCALES as readonly string[]).includes(base) ? (base as LegalLocale) : 'en'
}

const TERMS_TITLES: Record<LegalLocale, string> = {
  en: 'Terms of Service',
  ru: 'Условия использования',
  es: 'Terminos de servicio',
  zh: '服务条款',
  ja: '利用规约',
  de: 'Nutzungsbedingungen',
  fr: "Conditions d'utilisation",
  pt: 'Termos de uso',
  it: 'Termini di servizio',
  ko: '이용 약관',
  ar: 'شروط الخدمة',
  hi: 'सेवा की शर्तें',
  tr: 'Hizmet Sartlari',
  pl: 'Warunki korzystania',
  id: 'Ketentuan Layanan',
}

const PRIVACY_TITLES: Record<LegalLocale, string> = {
  en: 'Privacy Policy',
  ru: 'Политика конфиденциальности',
  es: 'Politica de privacidad',
  zh: '隐私政策',
  ja: 'プライバシーポリシー',
  de: 'Datenschutzrichtlinie',
  fr: 'Politique de confidentialite',
  pt: 'Politica de privacidade',
  it: 'Informativa sulla privacy',
  ko: '개인정보 처리방침',
  ar: 'سياسة الخصوصية',
  hi: 'गोपनीयता नीति',
  tr: 'Gizlilik Politikasi',
  pl: 'Polityka prywatnosci',
  id: 'Kebijakan Privasi',
}

const TERMS_EN = `<p>Last updated: May 26, 2026</p>
<h2>1. Acceptance of Terms</h2>
<p>By using StreakMeet, you agree to these Terms of Service. If you do not agree, please do not use the app. These Terms form a binding agreement between you and StreakMeet.</p>
<h2>2. Description of Service</h2>
<p>StreakMeet is a social app for maintaining real-life meet streaks with friends. The app uses geolocation and face recognition to verify meets and supports photo sharing (including remote selfies).</p>
<h2>3. Account Registration and Security</h2>
<p>You must create an account to use the app. You agree to provide accurate information and are responsible for safeguarding your credentials and all activity under your account.</p>
<h2>4. User Content and License</h2>
<p>You retain rights to content you upload. By uploading content, you grant StreakMeet a non-exclusive, royalty-free, worldwide license to use, store, display, reproduce, and modify that content solely to operate and improve the service.</p>
<h2>5. Conduct and Restrictions</h2>
<p>You may not use the service for illegal, fraudulent, or malicious purposes; upload offensive or infringing content; attempt unauthorized access; or use others' photos or biometrics without consent.</p>
<h2>6. Termination</h2>
<p>We may suspend or delete your account at any time if you violate these Terms or applicable law.</p>
<h2>7. Limitation of Liability</h2>
<p>The service is provided "as is". StreakMeet is not liable for direct or indirect damages arising from use or inability to use the app.</p>
<h2>8. Changes</h2>
<p>We may update these Terms. For material changes we will notify you in the app. Continued use constitutes acceptance.</p>`

const PRIVACY_EN = `<p>Last updated: May 26, 2026</p>
<h2>1. Introduction</h2>
<p>StreakMeet takes your privacy seriously. This Policy describes how we collect, use, store, and protect your personal data in accordance with GDPR.</p>
<h2>2. Data We Collect</h2>
<p>Account data (email, username, nickname, password hash), content (profile and meet photos), biometric face vectors for meet verification, location data when you enable it, and technical data (IP, timezone, device logs).</p>
<h2>3. Purposes</h2>
<p>We process data to provide the app, verify in-person meets, secure accounts, and improve the service.</p>
<h2>4. Biometrics</h2>
<p>Face vectors are processed only with your explicit consent during face enrollment and are used solely for Magic Meet verification. You may withdraw consent and delete biometrics at any time.</p>
<h2>5. Location</h2>
<p>Location is collected only with OS permission. Sharing with friends is opt-in and can be disabled anytime.</p>
<h2>6. Storage and Sharing</h2>
<p>Data is stored on secured servers. We do not sell your data. Third-party sharing is limited to infrastructure providers under GDPR standards or lawful requests.</p>
<h2>7. Retention</h2>
<p>Data is kept while your account exists. On deletion, soft delete applies for 30 days, then permanent removal from active databases (backups up to 90 days).</p>
<h2>8. Your Rights</h2>
<p>Access, rectification, erasure, restriction, portability, and withdrawal of consent — via app settings or contacting us.</p>`

import {
  TERMS_ES,
  PRIVACY_ES,
  TERMS_DE,
  PRIVACY_DE,
  TERMS_FR,
  PRIVACY_FR,
  TERMS_ZH,
  PRIVACY_ZH,
  TERMS_JA,
  PRIVACY_JA,
  TERMS_AR,
  PRIVACY_AR,
  TERMS_HI,
  PRIVACY_HI,
} from './locales.extra.js'

const LEGAL_HTML: Partial<Record<string, { terms: string; privacy: string }>> = {
  es: { terms: TERMS_ES, privacy: PRIVACY_ES },
  de: { terms: TERMS_DE, privacy: PRIVACY_DE },
  fr: { terms: TERMS_FR, privacy: PRIVACY_FR },
  zh: { terms: TERMS_ZH, privacy: PRIVACY_ZH },
  ja: { terms: TERMS_JA, privacy: PRIVACY_JA },
  pt: { terms: TERMS_ES, privacy: PRIVACY_ES },
  it: { terms: TERMS_ES, privacy: PRIVACY_ES },
  ko: { terms: TERMS_JA, privacy: PRIVACY_JA },
  pl: { terms: TERMS_DE, privacy: PRIVACY_DE },
  tr: { terms: TERMS_DE, privacy: PRIVACY_DE },
  id: { terms: TERMS_ES, privacy: PRIVACY_ES },
  ar: { terms: TERMS_AR, privacy: PRIVACY_AR },
  hi: { terms: TERMS_HI, privacy: PRIVACY_HI },
}

export function getLegalHtml(slug: 'TERMS' | 'PRIVACY', locale: string): string | undefined {
  const pack = LEGAL_HTML[locale]
  if (!pack) return undefined
  return slug === 'TERMS' ? pack.terms : pack.privacy
}

/** Returns localized title and HTML content for a legal document. */
export function getLocalizedLegal(
  slug: 'TERMS' | 'PRIVACY',
  locale: LegalLocale,
  fallbackContent: string
): { title: string; content: string } {
  const titles = slug === 'TERMS' ? TERMS_TITLES : PRIVACY_TITLES
  const title = titles[locale] ?? titles.en

  if (locale === 'ru') {
    return { title, content: fallbackContent }
  }
  if (locale === 'en') {
    return { title, content: slug === 'TERMS' ? TERMS_EN : PRIVACY_EN }
  }
  const localizedHtml = getLegalHtml(slug, locale)
  if (localizedHtml) {
    return { title, content: localizedHtml }
  }
  return { title, content: slug === 'TERMS' ? TERMS_EN : PRIVACY_EN }
}
