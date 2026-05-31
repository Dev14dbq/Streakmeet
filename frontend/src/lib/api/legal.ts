import type { LegalConsentStatus, LegalDocument } from '@streakmeet/api-spec'
import { migratedApi } from './migratedClient'

const legalApi = () => migratedApi()

export const getLegalDocument = (slug: 'terms' | 'privacy', locale?: string) =>
  legalApi().get<LegalDocument>(`/api/legal/${slug}`, {
    params: locale ? { locale } : undefined,
  })

export const getLegalConsentStatus = () =>
  legalApi().get<LegalConsentStatus>('/api/legal/status/me')

export const acceptLegalDocuments = () =>
  legalApi().post<{ ok: true; terms: number; privacy: number }>('/api/legal/accept')

export type { LegalConsentStatus, LegalDocument }
