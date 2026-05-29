import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { ArrowLeft, Image as ImageIcon, MapPin, UserPlus, Check, Clock, Shield } from 'lucide-react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import {
  acceptFriend,
  fetcher,
  requestFriend,
  getApiErrorMessage,
  type AuthUser,
  type PublicFriendship,
  type PublicProfile,
} from '../../lib/api'
import { toastError, toastSuccess } from '../../lib/toast'
import CachedImage from '../../components/CachedImage'
import { avatarInitial } from '../../lib/avatarInitial'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'

const NICKNAME_RE = /^[a-z0-9_]{3,20}$/

interface Props {
  currentUser: AuthUser | null
}

export default function PublicProfilePage({ currentUser }: Props) {
  const { t } = useTranslation()
  const { nickname = '' } = useParams()
  const navigate = useNavigate()
  const normalized = nickname.toLowerCase()

  const isValidNickname = NICKNAME_RE.test(normalized)

  const {
    data: profile,
    error: profileError,
    mutate: mutateProfile,
  } = useSWR<PublicProfile>(isValidNickname ? `/api/public/users/${normalized}` : null, fetcher)

  const getKey = (pageIndex: number, previousPageData: unknown[]) => {
    if (!isValidNickname || !profile) return null

    const isSelf = profile.friendship?.status === 'SELF' || currentUser?.id === profile.user.id
    const isFriend = profile.friendship?.status === 'ACCEPTED'
    const canViewPhotos = profile.user.isPublic || isSelf || isFriend

    if (!canViewPhotos) return null
    if (previousPageData && !previousPageData.length) return null
    return `/api/public/users/${normalized}/photos?page=${pageIndex + 1}&limit=12`
  }

  const { data, size, setSize, error: photosError } = useSWRInfinite(getKey, fetcher)
  const photos = data ? data.flat() : []
  const isReachingEnd = data && data[data.length - 1]?.length < 12

  const [friendLoading, setFriendLoading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)

  if (profileError) {
    if (isAxiosError(profileError) && profileError.response?.status === 404) {
      return <Navigate to="/404" replace />
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <p className="text-center text-sm text-[var(--color-on-surface-variant)]">
          {getApiErrorMessage(profileError, t('profile.loadFailed'))}
        </p>
      </div>
    )
  }

  if (!profile) {
    return null
  }

  const { user, friendship } = profile
  const isSelf = friendship?.status === 'SELF' || currentUser?.id === user.id
  const isFriend = friendship?.status === 'ACCEPTED'
  const canViewPhotos = user.isPublic || isSelf || isFriend

  async function handleAddFriend() {
    if (!currentUser) {
      navigate('/login', { state: { returnTo: `/${normalized}` } })
      return
    }
    setFriendLoading(true)
    try {
      await requestFriend(user.id)
      toastSuccess(t('profile.requestSent'))
      await mutateProfile()
    } catch (e) {
      toastError(getApiErrorMessage(e, t('profile.requestFailed')))
    } finally {
      setFriendLoading(false)
    }
  }

  async function handleAcceptFriend() {
    if (!friendship || friendship.status !== 'PENDING' || !('id' in friendship)) return
    setFriendLoading(true)
    try {
      await acceptFriend(friendship.id)
      toastSuccess(t('profile.nowFriends'))
      await mutateProfile()
    } catch (e) {
      toastError(getApiErrorMessage(e, t('profile.acceptFailed')))
    } finally {
      setFriendLoading(false)
    }
  }

  function renderFriendButton() {
    if (isSelf) {
      return (
        <Link to="/profile" className="btn btn--secondary btn--lg w-full max-w-sm">
          {t('streak.myProfile')}
        </Link>
      )
    }

    const f = friendship as PublicFriendship | null

    if (f?.status === 'ACCEPTED') {
      return (
        <button
          type="button"
          disabled
          className="btn btn--secondary btn--lg w-full max-w-sm text-[var(--color-on-surface-variant)]"
        >
          <Check size={20} />
          {t('settings.friends')}
        </button>
      )
    }

    if (f?.status === 'PENDING' && f.isIncoming) {
      return (
        <button
          type="button"
          onClick={handleAcceptFriend}
          disabled={friendLoading}
          className="btn btn--primary btn--lg w-full max-w-sm"
        >
          {friendLoading ? '...' : t('profile.acceptRequest')}
        </button>
      )
    }

    if (f?.status === 'PENDING') {
      return (
        <button
          type="button"
          disabled
          className="btn btn--secondary btn--lg w-full max-w-sm text-[var(--color-on-surface-variant)]"
        >
          <Clock size={20} />
          {t('profile.requestSent')}
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={handleAddFriend}
        disabled={friendLoading}
        className="btn btn--primary btn--lg w-full max-w-sm"
      >
        <UserPlus size={20} />
        {friendLoading ? '...' : currentUser ? t('profile.addFriend') : t('profile.signInToAdd')}
      </button>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-background)] pb-safe">
      <div className="px-6 pt-12 pb-6 max-w-lg mx-auto w-full flex-1">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate(currentUser ? '/' : '/login')
          }
          className="btn btn--icon-lg btn--secondary mb-6"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={22} />
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 relative">
            {user.avatarUrl ? (
              <div className="absolute inset-0 rounded-full blur-xl opacity-60 scale-110 z-0">
                <CachedImage
                  path={user.avatarUrl}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            ) : (
              <div className="absolute inset-0 rounded-full blur-xl opacity-30 scale-110 z-0 bg-[var(--color-surface-container-highest)]" />
            )}
            <div className="relative z-10 w-28 h-28 rounded-full bg-[var(--color-surface-container-high)] border-2 border-subtle overflow-hidden flex items-center justify-center">
              {user.avatarUrl ? (
                <CachedImage path={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-[var(--color-brand-primary)] leading-none select-none">
                  {avatarInitial(user.nickname)}
                </span>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
            @{user.nickname}
          </h1>
        </div>

        <div className="flex justify-center mb-10">{renderFriendButton()}</div>

        <div>
          <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
            {t('settings.meets')}
          </h2>

          {!canViewPhotos ? (
            <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-subtle">
              <Shield
                size={32}
                className="text-[var(--color-on-surface-variant)] opacity-50 mb-3"
              />
              <p className="text-[var(--color-on-surface-variant)] text-sm font-medium">
                {t('settings.publicProfileDesc')}
              </p>
            </div>
          ) : photosError ? (
            <div className="glass-card rounded-3xl p-8 text-center border border-subtle">
              <p className="text-on-surface font-semibold mb-2">{t('profile.loadFailed')}</p>
              <button
                type="button"
                onClick={() => setSize(1)}
                className="text-sm font-bold text-[var(--color-brand-primary)]"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-subtle">
              <ImageIcon
                size={32}
                className="text-[var(--color-on-surface-variant)] opacity-50 mb-3"
              />
              <p className="text-[var(--color-on-surface-variant)] text-sm font-medium">
                {t('home.noResults')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {photos.map(
                  (photo: {
                    id: string
                    photoUrl: string
                    latitude?: number | null
                    longitude?: number | null
                    streakDay: {
                      streak: {
                        userA: { id: string; nickname: string }
                        userB: { id: string; nickname: string }
                      }
                    }
                  }) => {
                    const partner =
                      photo.streakDay.streak.userA.id === user.id
                        ? photo.streakDay.streak.userB
                        : photo.streakDay.streak.userA
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setSelectedPhoto(photo as PhotoData)}
                        className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] group text-left"
                      >
                        <CachedImage
                          path={photo.photoUrl}
                          alt=""
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
                          <span className="text-xs text-on-surface font-bold drop-shadow-md">
                            @{partner.nickname}
                          </span>
                          {photo.latitude != null && photo.longitude != null && (
                            <div className="flex items-center gap-1">
                              <MapPin size={10} className="text-[var(--color-brand-primary)]" />
                              <span className="text-[9px] text-[var(--color-on-surface-variant)] font-medium truncate">
                                {photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  }
                )}
              </div>
              {!isReachingEnd && (
                <button
                  type="button"
                  onClick={() => setSize(size + 1)}
                  className="btn btn--secondary btn--lg mt-6 w-full"
                >
                  {t('common.retry')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {selectedPhoto && (
        <PhotoViewerModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  )
}
