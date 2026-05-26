import { useState } from 'react'
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { ArrowLeft, Image as ImageIcon, MapPin, UserPlus, Check, Clock } from 'lucide-react'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import {
  acceptFriend,
  fetcher,
  requestFriend,
  type AuthUser,
  type PublicFriendship,
  type PublicProfile,
} from '../../lib/api'
import { toastError, toastSuccess } from '../../lib/toast'
import CachedImage from '../../components/CachedImage'

const NICKNAME_RE = /^[a-z0-9_]{3,20}$/

interface Props {
  currentUser: AuthUser | null
}

export default function PublicProfilePage({ currentUser }: Props) {
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
    if (!isValidNickname) return null
    if (previousPageData && !previousPageData.length) return null
    return `/api/public/users/${normalized}/photos?page=${pageIndex + 1}&limit=12`
  }

  const { data, size, setSize, error: photosError } = useSWRInfinite(getKey, fetcher)
  const photos = data ? data.flat() : []
  const loadingPhotos = !data && !photosError
  const isReachingEnd = data && data[data.length - 1]?.length < 12

  const [friendLoading, setFriendLoading] = useState(false)

  if (profileError) {
    if (isAxiosError(profileError) && profileError.response?.status === 404) {
      return <Navigate to="/404" replace />
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6">
        <p className="text-center text-sm text-[var(--color-on-surface-variant)]">
          Не удалось загрузить профиль
        </p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <p className="text-[var(--color-on-surface-variant)] animate-pulse">Загрузка...</p>
      </div>
    )
  }

  const { user, friendship } = profile
  const isSelf = friendship?.status === 'SELF' || currentUser?.id === user.id

  async function handleAddFriend() {
    if (!currentUser) {
      navigate('/login', { state: { returnTo: `/${normalized}` } })
      return
    }
    setFriendLoading(true)
    try {
      await requestFriend(user.id)
      toastSuccess('Заявка отправлена')
      await mutateProfile()
    } catch {
      toastError('Не удалось отправить заявку')
    } finally {
      setFriendLoading(false)
    }
  }

  async function handleAcceptFriend() {
    if (!friendship || friendship.status !== 'PENDING' || !('id' in friendship)) return
    setFriendLoading(true)
    try {
      await acceptFriend(friendship.id)
      toastSuccess('Вы теперь друзья!')
      await mutateProfile()
    } catch {
      toastError('Не удалось принять заявку')
    } finally {
      setFriendLoading(false)
    }
  }

  function renderFriendButton() {
    if (isSelf) {
      return (
        <Link
          to="/profile"
          className="w-full max-w-sm rounded-full bg-[var(--color-surface-container-high)] py-4 text-base font-bold text-white text-center transition hover:bg-[var(--color-surface-container-highest)] active:scale-95"
        >
          Мой профиль
        </Link>
      )
    }

    const f = friendship as PublicFriendship | null

    if (f?.status === 'ACCEPTED') {
      return (
        <button
          type="button"
          disabled
          className="w-full max-w-sm rounded-full bg-[var(--color-surface-container-high)] py-4 text-base font-bold text-[var(--color-on-surface-variant)] flex items-center justify-center gap-2"
        >
          <Check size={20} />В друзьях
        </button>
      )
    }

    if (f?.status === 'PENDING' && f.isIncoming) {
      return (
        <button
          type="button"
          onClick={handleAcceptFriend}
          disabled={friendLoading}
          className="w-full max-w-sm rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          {friendLoading ? '...' : 'Принять заявку'}
        </button>
      )
    }

    if (f?.status === 'PENDING') {
      return (
        <button
          type="button"
          disabled
          className="w-full max-w-sm rounded-full bg-[var(--color-surface-container-high)] py-4 text-base font-bold text-[var(--color-on-surface-variant)] flex items-center justify-center gap-2"
        >
          <Clock size={20} />
          Заявка отправлена
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={handleAddFriend}
        disabled={friendLoading}
        className="w-full max-w-sm rounded-full bg-[var(--color-brand-primary)] py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] transition hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <UserPlus size={20} />
        {friendLoading ? '...' : currentUser ? 'Добавить в друзья' : 'Войти и добавить в друзья'}
      </button>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-black pb-safe">
      <div className="px-6 pt-12 pb-6 max-w-lg mx-auto w-full flex-1">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate(currentUser ? '/' : '/login')
          }
          className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] text-white transition hover:bg-[var(--color-surface-container-highest)] active:scale-95"
          aria-label="Назад"
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
            <div className="relative z-10 w-28 h-28 rounded-full bg-[var(--color-surface-container-high)] border-2 border-white/10 overflow-hidden flex items-center justify-center">
              {user.avatarUrl ? (
                <CachedImage path={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">👤</span>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-white tracking-tight">{user.nickname}</h1>
          <p className="text-[var(--color-on-surface-variant)] text-sm font-medium mt-1">
            @{user.nickname}
          </p>
        </div>

        <div className="flex justify-center mb-10">{renderFriendButton()}</div>

        <div>
          <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
            Фотографии встреч
          </h2>

          {loadingPhotos ? (
            <p className="text-[var(--color-on-surface-variant)] text-sm text-center py-10 opacity-70">
              Загрузка...
            </p>
          ) : photos.length === 0 ? (
            <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-white/5">
              <ImageIcon
                size={32}
                className="text-[var(--color-on-surface-variant)] opacity-50 mb-3"
              />
              <p className="text-[var(--color-on-surface-variant)] text-sm font-medium">
                Пока нет фотографий
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
                      <div
                        key={photo.id}
                        className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_10px_30px_rgba(0,0,0,0.3)] group"
                      >
                        <CachedImage
                          path={photo.photoUrl}
                          alt=""
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
                          <span className="text-xs text-white font-bold drop-shadow-md">
                            с @{partner.nickname}
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
                      </div>
                    )
                  }
                )}
              </div>
              {!isReachingEnd && (
                <button
                  type="button"
                  onClick={() => setSize(size + 1)}
                  className="w-full mt-6 py-4 rounded-full bg-[var(--color-surface-container-high)] text-white font-bold hover:bg-[var(--color-surface-container-highest)] transition"
                >
                  Загрузить ещё
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
