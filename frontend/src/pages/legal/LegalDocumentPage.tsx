import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import useSWR from 'swr'
import { getLegalDocument, type LegalDocument } from '../../lib/api'
import { getCurrentLocale } from '../../i18n'
import { formatDate } from '../../i18n/format'

interface Props {
  slug: 'terms' | 'privacy'
  fallbackTitle: string
}

export default function LegalDocumentPage({ slug, fallbackTitle }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const locale = getCurrentLocale()
  const { data, error, isLoading } = useSWR<LegalDocument>([`/api/legal/${slug}`, locale], () =>
    getLegalDocument(slug, locale).then((r) => r.data)
  )

  const title = data?.title ?? fallbackTitle
  const updatedAt = data?.updatedAt
    ? formatDate(data.updatedAt, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="flex flex-col px-6 pt-4 pb-8 min-h-screen bg-[var(--color-background)] text-on-surface">
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="btn btn--icon-lg btn--secondary"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-on-surface-variant)] animate-pulse">
          {t('common.loadingDocument')}
        </p>
      ) : error ? (
        <p className="text-sm text-[var(--color-error)]">{t('legal.loadFailed')}</p>
      ) : (
        <div className="prose prose-invert max-w-none text-sm text-[var(--color-on-surface-variant)] legal-document">
          {updatedAt && (
            <p className="text-[var(--color-on-surface-variant)] mb-4">
              {t('legal.versionUpdated', { version: data?.version, date: updatedAt })}
            </p>
          )}
          <div dangerouslySetInnerHTML={{ __html: data?.content ?? '' }} />
        </div>
      )}
    </div>
  )
}
