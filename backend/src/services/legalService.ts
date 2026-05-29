import { prisma } from '../lib/prisma.js'
import { getLocalizedLegal, normalizeLegalLocale } from '../lib/legalTranslations.js'
import type { LegalDocument } from '../types/api.js'
import { ErrorCodes } from '../lib/apiErrors.js'
import { ApiHttpError } from '../lib/httpErrors.js'

type LegalSlug = 'TERMS' | 'PRIVACY'

export async function getLegalDocument(
  slug: LegalSlug,
  rawLocale: string | undefined
): Promise<LegalDocument> {
  const doc = await prisma.legalDocument.findUnique({
    where: { slug },
    select: { slug: true, title: true, version: true, content: true, updatedAt: true },
  })
  if (!doc) {
    throw new ApiHttpError(404, ErrorCodes.LEGAL_DOCUMENT_NOT_FOUND)
  }
  const locale = normalizeLegalLocale(rawLocale)
  const localized = getLocalizedLegal(slug, locale, doc.content)
  return {
    slug: slug === 'TERMS' ? 'terms' : 'privacy',
    title: localized.title,
    version: doc.version,
    content: localized.content,
    updatedAt: doc.updatedAt.toISOString(),
  }
}
