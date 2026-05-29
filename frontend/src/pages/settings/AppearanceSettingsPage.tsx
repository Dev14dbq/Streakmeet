import { Check, Moon, Smartphone, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  getResolvedTheme,
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from '../../lib/theme'
import { SettingsPageShell, SettingsToggle } from './settingsUi'

const MODES: Exclude<ThemePreference, 'system'>[] = ['light', 'dark']

export default function AppearanceSettingsPage() {
  const { t } = useTranslation()
  const preference = useThemePreference()
  const systemEnabled = preference === 'system'
  const resolved = getResolvedTheme(preference)

  function chooseMode(mode: Exclude<ThemePreference, 'system'>) {
    setThemePreference(mode)
  }

  return (
    <SettingsPageShell
      title={t('theme.title')}
      subtitle={t('settings.appearanceIntro')}
      backLabel={t('common.back')}
    >
      <div className="glass-card mb-5 rounded-3xl p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface-container-highest)]">
              <Smartphone size={20} className="text-[var(--color-brand-primary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-on-surface)]">
                {t('theme.system')}
              </p>
              <p className="text-xs text-[var(--color-on-surface-variant)]">
                {t('settings.systemThemeDesc')}
              </p>
            </div>
          </div>
          <SettingsToggle
            on={systemEnabled}
            onChange={(enabled) => setThemePreference(enabled ? 'system' : resolved)}
            label={t('theme.system')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {MODES.map((mode) => {
            const selected = !systemEnabled && preference === mode
            const Icon = mode === 'light' ? Sun : Moon
            return (
              <button
                key={mode}
                type="button"
                onClick={() => chooseMode(mode)}
                className={`rounded-3xl border p-4 text-left transition ${
                  selected
                    ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/10'
                    : 'border-subtle bg-[var(--color-surface-container-high)]/70'
                }`}
              >
                <div
                  className={`mb-4 h-24 rounded-2xl p-3 ${
                    mode === 'light' ? 'bg-white text-zinc-900' : 'bg-zinc-950 text-white'
                  }`}
                >
                  <div className="mb-3 h-3 w-16 rounded-full bg-current opacity-80" />
                  <div className="mb-2 h-2 w-full rounded-full bg-current opacity-20" />
                  <div className="h-2 w-3/4 rounded-full bg-current opacity-20" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-on-surface)]">
                    <Icon size={16} />
                    {t(`theme.${mode}`)}
                  </span>
                  {selected && <Check size={18} className="text-[var(--color-brand-primary)]" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <p className="px-2 text-xs leading-relaxed text-[var(--color-on-surface-variant)]">
        {t('settings.appearanceFootnote', { mode: t(`theme.${resolved}`) })}
      </p>
    </SettingsPageShell>
  )
}
