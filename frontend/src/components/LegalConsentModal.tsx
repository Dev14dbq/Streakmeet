import { Link } from 'react-router-dom'
import { FileText, Shield } from 'lucide-react'
import { acceptLegalDocuments, type LegalConsentStatus } from '../lib/api'
import { toastError } from '../lib/toast'

interface Props {
  status: LegalConsentStatus
  onAccepted: () => void
}

export default function LegalConsentModal({ status, onAccepted }: Props) {
  async function handleAccept() {
    try {
      await acceptLegalDocuments()
      onAccepted()
    } catch {
      toastError('Не удалось сохранить согласие')
    }
  }

  const termsUpdated = !status.terms.accepted
  const privacyUpdated = !status.privacy.accepted

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-3xl bg-[var(--color-surface-container-high)] border border-white/10 shadow-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-consent-title"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-[var(--color-brand-primary)]/15 flex items-center justify-center">
            <FileText size={22} className="text-[var(--color-brand-primary)]" />
          </div>
          <div>
            <h2 id="legal-consent-title" className="text-lg font-bold text-white">
              Обновлены документы
            </h2>
            <p className="text-xs text-[var(--color-on-surface-variant)]">
              Нужно ваше согласие для продолжения
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed mb-4">
          Мы обновили{' '}
          {termsUpdated && privacyUpdated
            ? 'Условия использования и Политику конфиденциальности'
            : termsUpdated
              ? 'Условия использования'
              : 'Политику конфиденциальности'}
          . Пожалуйста, ознакомьтесь с изменениями и подтвердите согласие.
        </p>

        <div className="flex flex-col gap-2 mb-6">
          {termsUpdated && (
            <Link
              to="/terms"
              className="flex items-center gap-3 rounded-2xl bg-[var(--color-surface-container-highest)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <FileText size={18} className="text-[var(--color-on-surface-variant)]" />
              Прочитать условия использования
            </Link>
          )}
          {privacyUpdated && (
            <Link
              to="/privacy"
              className="flex items-center gap-3 rounded-2xl bg-[var(--color-surface-container-highest)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Shield size={18} className="text-[var(--color-on-surface-variant)]" />
              Прочитать политику конфиденциальности
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={handleAccept}
          className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition active:scale-95"
        >
          Принимаю
        </button>
      </div>
    </div>
  )
}
