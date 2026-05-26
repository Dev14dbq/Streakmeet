import { useTranslation } from 'react-i18next'
import LegalDocumentPage from './LegalDocumentPage'

export default function TermsPage() {
  const { t } = useTranslation()
  return <LegalDocumentPage slug="terms" fallbackTitle={t('legal.terms')} />
}
