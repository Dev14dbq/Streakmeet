import { useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import useSWR from 'swr'
import type { AuthUser, LegalConsentStatus } from '../lib/api'
import { getLegalConsentStatus } from '../lib/api'
import { SWR_KEYS } from '../lib/swrKeys'

const legalFetcher = () => getLegalConsentStatus().then((r) => r.data)

export function useLegalConsent(user: AuthUser | null, isLoggedIn: boolean) {
  const location = useLocation()

  const {
    data: legalStatus,
    error,
    mutate,
  } = useSWR<LegalConsentStatus>(user ? SWR_KEYS.legalStatus : null, legalFetcher, {
    revalidateOnFocus: false,
  })

  const legalChecked = legalStatus !== undefined || error !== undefined
  const legalFetchFailed = !!error && !legalStatus

  const retryLegalCheck = useCallback(() => {
    void mutate()
  }, [mutate])

  const onLegalAccepted = useCallback(() => {
    mutate(
      (prev) =>
        prev
          ? {
              ...prev,
              needsAcceptance: false,
              terms: { ...prev.terms, accepted: true },
              privacy: { ...prev.privacy, accepted: true },
            }
          : prev,
      { revalidate: false }
    )
  }, [mutate])

  const needsLegalConsent =
    isLoggedIn &&
    legalChecked &&
    legalStatus?.needsAcceptance &&
    location.pathname !== '/terms' &&
    location.pathname !== '/privacy'

  return {
    legalStatus: legalStatus ?? null,
    legalChecked,
    legalFetchFailed,
    needsLegalConsent,
    retryLegalCheck,
    onLegalAccepted,
  }
}
