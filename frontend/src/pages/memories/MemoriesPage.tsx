import { useTranslation } from 'react-i18next'

export default function MemoriesPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-surface-container-high)]">
        <span className="text-4xl">🎞️</span>
      </div>
      <h2 className="mb-2 text-xl font-bold text-white tracking-tight">{t('memories.title')}</h2>
      <p className="max-w-[280px] text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
        {t('memories.description')}
      </p>
    </div>
  )
}
