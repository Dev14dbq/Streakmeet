import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { searchUsers, findUserByScanTarget } from '../../lib/api'

export default function LegacyAddRedirect() {
  const { t } = useTranslation()
  const { qrCodeId = '' } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!qrCodeId) {
      navigate('/', { replace: true })
      return
    }
    void (async () => {
      try {
        const { data } = await searchUsers(qrCodeId)
        const user = findUserByScanTarget(data, qrCodeId)
        if (user?.nickname) {
          navigate(`/${user.nickname}`, { replace: true })
        } else {
          navigate('/404', { replace: true })
        }
      } catch {
        navigate('/404', { replace: true })
      }
    })()
  }, [qrCodeId, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-[var(--color-on-surface-variant)] animate-pulse">
        {t('redirect.toProfile')}
      </p>
    </div>
  )
}
