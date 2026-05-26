import { useTranslation } from 'react-i18next'
import LegalDocumentPage from './LegalDocumentPage'

export default function PrivacyPage() {
  const { t } = useTranslation()
  return <LegalDocumentPage slug="privacy" fallbackTitle={t('legal.privacy')} />
}
