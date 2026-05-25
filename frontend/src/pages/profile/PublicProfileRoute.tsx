import { Navigate, useParams } from 'react-router-dom'
import PublicProfilePage from './PublicProfilePage'
import { isPublicNicknamePath, type AuthUser } from '../../lib/api'

export default function PublicProfileRoute({ currentUser }: { currentUser: AuthUser | null }) {
  const { nickname = '' } = useParams()
  if (!isPublicNicknamePath(nickname)) {
    return <Navigate to="/404" replace />
  }
  return <PublicProfilePage currentUser={currentUser} />
}
