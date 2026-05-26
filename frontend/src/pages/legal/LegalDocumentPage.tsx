import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import useSWR from 'swr'
import { fetcher, type LegalDocument } from '../../lib/api'

interface Props {
  slug: 'terms' | 'privacy'
  fallbackTitle: string
}

export default function LegalDocumentPage({ slug, fallbackTitle }: Props) {
  const navigate = useNavigate()
  const { data, error, isLoading } = useSWR<LegalDocument>(`/api/legal/${slug}`, fetcher)

  const title = data?.title ?? fallbackTitle
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="flex flex-col px-6 pt-12 pb-8 min-h-screen bg-black text-white">
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-white transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-on-surface-variant)] animate-pulse">
          Загрузка документа...
        </p>
      ) : error ? (
        <p className="text-sm text-[var(--color-error)]">
          Не удалось загрузить документ. Попробуйте позже.
        </p>
      ) : (
        <div className="prose prose-invert max-w-none text-sm text-[var(--color-on-surface-variant)] legal-document">
          {updatedAt && (
            <p className="text-[var(--color-on-surface-variant)] mb-4">
              Версия {data?.version} · обновлено {updatedAt}
            </p>
          )}
          <div dangerouslySetInnerHTML={{ __html: data?.content ?? '' }} />
        </div>
      )}
    </div>
  )
}
