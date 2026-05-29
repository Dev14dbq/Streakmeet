import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, getCurrentLocale } from '../../i18n'
import { SUPPORTED_LANGUAGES } from '../../i18n/languages'
import { SettingsPageShell } from './settingsUi'

export default function LanguageSettingsPage() {
  const { t } = useTranslation()
  const current = getCurrentLocale()

  return (
    <SettingsPageShell
      title={t('language.title')}
      subtitle={t('settings.languageIntro')}
      backLabel={t('common.back')}
    >
      <div className="glass-card divide-subtle overflow-hidden rounded-3xl divide-y">
        {SUPPORTED_LANGUAGES.map((language) => {
          const selected = language.code === current
          return (
            <button
              key={language.code}
              type="button"
              onClick={() => changeAppLanguage(language.code)}
              className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-white/5 active:scale-[0.99]"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--color-on-surface)]">
                  {language.nativeName}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-on-surface-variant)]">
                  {language.name}
                </p>
              </div>
              {selected && <Check size={20} className="text-[var(--color-brand-primary)]" />}
            </button>
          )
        })}
      </div>
    </SettingsPageShell>
  )
}
