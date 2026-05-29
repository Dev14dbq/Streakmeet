import type { LegalConsentStatus, LegalDocument } from '@streakmeet/api-spec'
import { api } from './client'

export const getLegalDocument = (slug: 'terms' | 'privacy', locale?: string) =>
  api.get<LegalDocument>(`/api/legal/${slug}`, {
    params: locale ? { locale } : undefined,
  })

export const getLegalConsentStatus = () => api.get<LegalConsentStatus>('/api/legal/status/me')

export const acceptLegalDocuments = () =>
  api.post<{ ok: true; terms: number; privacy: number }>('/api/legal/accept')

export type { LegalConsentStatus, LegalDocument }
