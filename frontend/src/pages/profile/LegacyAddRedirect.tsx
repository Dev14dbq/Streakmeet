import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { searchUsers } from '../../lib/api'

export default function LegacyAddRedirect() {
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
        const user = data[0]
        if (user?.nickname) {
          navigate(`/${user.nickname}`, { replace: true })
        } else {
          navigate('/login', { replace: true })
        }
      } catch {
        navigate('/login', { replace: true })
      }
    })()
  }, [qrCodeId, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <p className="text-[var(--color-on-surface-variant)] animate-pulse">Переход в профиль...</p>
    </div>
  )
}
