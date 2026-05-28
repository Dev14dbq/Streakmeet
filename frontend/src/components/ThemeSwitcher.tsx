import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme'

const OPTIONS: ThemePreference[] = ['light', 'dark', 'system']

export default function ThemeSwitcher() {
  const { t } = useTranslation()
  const current = getThemePreference()

  return (
    <div className="flex items-center justify-between gap-4 py-4 px-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-container-highest)] flex items-center justify-center shrink-0">
          <Palette size={18} className="text-[var(--color-on-surface-variant)]" />
        </div>
        <div className="min-w-0">
          <p className="text-[var(--color-on-surface)] font-medium text-sm">{t('theme.title')}</p>
          <p className="text-[var(--color-on-surface-variant)] text-xs mt-0.5 truncate">
            {t('theme.description')}
          </p>
        </div>
      </div>
      <select
        value={current}
        onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
        className="max-w-[140px] shrink-0 rounded-xl bg-[var(--color-surface-container-highest)] border border-[var(--color-outline-variant)]/30 px-3 py-2 text-sm text-[var(--color-on-surface)] outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
        aria-label={t('theme.title')}
      >
        {OPTIONS.map((mode) => (
          <option key={mode} value={mode}>
            {t(`theme.${mode}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
