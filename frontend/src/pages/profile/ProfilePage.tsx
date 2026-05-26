import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { QrCode, Image as ImageIcon, Settings, X, MapPin, Camera } from 'lucide-react'
import Webcam from 'react-webcam'
import useSWRInfinite from 'swr/infinite'
import ProfileQrModal from '../../components/ProfileQrModal'
import CachedImage from '../../components/CachedImage'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'
import { uploadAvatar, fetcher, type AuthUser } from '../../lib/api'
import { invalidateCachedImage } from '../../lib/remoteImageCache'
import { toastError } from '../../lib/toast'

interface Props {
  user: AuthUser
}

export default function ProfilePage({ user: initialUser }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(initialUser)

  const getKey = (pageIndex: number, previousPageData: unknown[]) => {
    if (previousPageData && !previousPageData.length) return null
    return `/api/users/photos?page=${pageIndex + 1}&limit=12`
  }
  const { data, size, setSize, error } = useSWRInfinite(getKey, fetcher)
  const photos = data ? data.flat() : []
  const loadingPhotos = !data && !error
  const isReachingEnd = data && data[data.length - 1]?.length < 12

  const [showQR, setShowQR] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showAvatarSheet, setShowAvatarSheet] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const navState = location.state as { openAvatarSheet?: boolean } | null
    if (navState?.openAvatarSheet) {
      setShowAvatarSheet(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  async function saveAvatar(base64: string) {
    setUploading(true)
    const previousAvatar = user.avatarUrl
    try {
      const { data: res } = await uploadAvatar(base64)
      await invalidateCachedImage(previousAvatar)
      const updatedUser = { ...user, avatarUrl: res.avatarUrl }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setShowCamera(false)
      setShowAvatarSheet(false)
    } catch {
      toastError('Ошибка загрузки аватара')
    } finally {
      setUploading(false)
    }
  }

  async function handleCaptureAvatar() {
    if (!webcamRef.current) return
    const imageSrc = webcamRef.current.getScreenshot()
    if (!imageSrc) return
    await saveAvatar(imageSrc)
  }

  function handlePickFromGallery() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      if (base64) await saveAvatar(base64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!user) return null

  return (
    <div className="flex flex-col px-6 pt-12 pb-6 min-h-screen relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => setShowQR(true)}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] hover:text-white hover:bg-[var(--color-surface-container-highest)] transition active:scale-95"
          aria-label="Мой QR"
        >
          <QrCode size={22} />
        </button>
        <h1 className="text-lg font-bold text-white tracking-tight">Профиль</h1>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] hover:text-white hover:bg-[var(--color-surface-container-highest)] transition active:scale-95"
          aria-label="Настройки"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Profile Info */}
      <div className="flex flex-col items-center mb-8">
        <button
          type="button"
          onClick={() => setShowAvatarSheet(true)}
          disabled={uploading}
          className="mb-4 relative group disabled:opacity-60"
          aria-label="Изменить фото профиля"
        >
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
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition flex items-center justify-center">
              <Camera size={28} className="text-white" />
            </div>
          </div>
        </button>

        <h2 className="text-2xl font-extrabold text-white tracking-tight">{user.nickname}</h2>
        <button
          type="button"
          onClick={() => navigate(`/${user.nickname}`)}
          className="text-[var(--color-on-surface-variant)] text-sm font-medium mt-1 hover:text-[var(--color-brand-primary)] transition"
        >
          @{user.nickname} · публичный профиль
        </button>
      </div>

      {/* Photos Grid */}
      <div>
        <h3 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
          История встреч
        </h3>

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
              Пока нет совместных фото
            </p>
            <p className="text-[var(--color-on-surface-variant)] text-xs mt-2 opacity-70">
              Сфотографируйтесь с другом через камеру внизу
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
                    </button>
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

      {/* Avatar sheet */}
      {showAvatarSheet && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAvatarSheet(false)}
        >
          <div
            className="bg-[var(--color-surface-container-high)] rounded-t-3xl px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <h3 className="text-lg font-bold text-white mb-4 text-center">Фото профиля</h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAvatarSheet(false)
                  setShowCamera(true)
                }}
                className="w-full rounded-2xl bg-[var(--color-surface-container-highest)] py-4 text-white font-semibold active:scale-[0.99] transition"
              >
                Сделать фото
              </button>
              <button
                type="button"
                onClick={handlePickFromGallery}
                className="w-full rounded-2xl bg-[var(--color-surface-container-highest)] py-4 text-white font-semibold active:scale-[0.99] transition"
              >
                Выбрать из галереи
              </button>
              <button
                type="button"
                onClick={() => setShowAvatarSheet(false)}
                className="w-full py-4 text-[var(--color-on-surface-variant)] font-semibold"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileQrModal nickname={user.nickname} open={showQR} onClose={() => setShowQR(false)} />

      {/* Camera Modal for Avatar */}
      {showCamera && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="flex items-center justify-between p-6 pb-2">
            <h2 className="text-white font-bold text-xl">Фото профиля</h2>
            <button
              type="button"
              onClick={() => setShowCamera(false)}
              className="p-2 bg-zinc-900 rounded-full text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden rounded-3xl mx-4 mb-6 bg-zinc-900 flex items-center justify-center">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'user', aspectRatio: 1 }}
              className="w-full h-full object-cover max-w-md"
              onUserMediaError={() => toastError('Ошибка доступа к камере')}
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 rounded-full border-4 border-[var(--color-brand-primary)] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
            </div>
          </div>

          <div className="px-6 pb-12">
            <button
              type="button"
              onClick={handleCaptureAvatar}
              disabled={uploading}
              className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
            >
              {uploading ? 'Сохранение...' : 'Сделать фото'}
            </button>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <PhotoViewerModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  )
}
