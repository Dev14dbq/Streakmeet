import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  message: string
  onRetry: () => void
}

export default function ConnectionErrorState({ message, onRetry }: Props) {
  const { t } = useTranslation()

  return (
    <div className="glass-card rounded-3xl p-8 text-center border border-subtle flex flex-col items-center gap-3 my-4">
      <WifiOff size={40} className="text-[var(--color-on-surface-variant)]" aria-hidden />
      <p className="text-on-surface font-semibold">{t('errors.noConnection')}</p>
      {message !== t('errors.noConnection') && (
        <p className="text-sm text-[var(--color-on-surface-variant)] max-w-xs">{message}</p>
      )}
      <button type="button" onClick={onRetry} className="btn btn--secondary mt-1">
        {t('common.retry')}
      </button>
    </div>
  )
}
