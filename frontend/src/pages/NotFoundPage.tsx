import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Props {
  homeTo?: string
  title?: string
  message?: string
}

export default function NotFoundPage({ homeTo = '/', title, message }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pageTitle = title ?? t('notFound.title')
  const pageMessage = message ?? t('notFound.message')

  return (
    <div className="flex min-h-screen flex-col bg-black px-6 pt-14 pb-safe">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 select-none text-7xl font-extrabold tracking-tighter text-[var(--color-brand-primary)]">
          404
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{pageTitle}</h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
          {pageMessage}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-col gap-3 pb-6">
        <button
          type="button"
          onClick={() => navigate(homeTo, { replace: true })}
          className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95"
        >
          {t('notFound.goHome')}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-full py-4 text-sm font-semibold text-[var(--color-on-surface-variant)] transition hover:text-white"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  )
}
