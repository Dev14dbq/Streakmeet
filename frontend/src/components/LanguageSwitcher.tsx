import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { changeAppLanguage, getCurrentLocale } from '../i18n'
import { SUPPORTED_LANGUAGES } from '../i18n/languages'

export default function LanguageSwitcher() {
  const { t } = useTranslation()
  const current = getCurrentLocale()

  return (
    <div className="flex items-center justify-between gap-4 py-4 px-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shrink-0">
          <Globe size={18} className="text-[var(--color-on-surface-variant)]" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium text-sm">{t('language.title')}</p>
          <p className="text-[var(--color-on-surface-variant)] text-xs mt-0.5 truncate">
            {t('language.description')}
          </p>
        </div>
      </div>
      <select
        value={current}
        onChange={(e) => changeAppLanguage(e.target.value)}
        className="max-w-[140px] shrink-0 rounded-xl bg-[var(--color-surface-container-highest)] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
        aria-label={t('language.title')}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.nativeName}
          </option>
        ))}
      </select>
    </div>
  )
}
