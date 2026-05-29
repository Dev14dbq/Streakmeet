import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { QrCode, Image as ImageIcon, Settings, X, MapPin, Camera } from 'lucide-react'
import Webcam from 'react-webcam'
import useSWRInfinite from 'swr/infinite'
import CameraGate from '../../components/CameraGate'
import ProfileQrModal from '../../components/ProfileQrModal'
import CachedImage from '../../components/CachedImage'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'
import { uploadAvatar, getApiErrorMessage, type AuthUser } from '../../lib/api'
import { avatarInitial } from '../../lib/avatarInitial'
import { captureVideoFrame } from '../../lib/captureVideoFrame'
import { SWR_KEYS } from '../../lib/swrKeys'
import { invalidateCachedImage } from '../../lib/remoteImageCache'
import { useCameraGate } from '../../lib/useCameraGate'
import { useOverlayTransition } from '../../lib/useOverlayTransition'
import { waitForLiveVideo } from '../../lib/webCamera'
import { toastError } from '../../lib/toast'

interface Props {
  user: AuthUser
}

export default function ProfilePage({ user: initialUser }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(initialUser)

  useEffect(() => {
    setUser(initialUser)
  }, [initialUser])

  const getKey = (pageIndex: number, previousPageData: unknown[]) => {
    if (previousPageData && !previousPageData.length) return null
    return SWR_KEYS.photosPage(pageIndex + 1)
  }
  const { data, size, setSize, error } = useSWRInfinite(getKey)
  const photos = data ? data.flat() : []
  const loadingPhotos = !data && !error
  const isReachingEnd = data && data[data.length - 1]?.length < 12

  const [showQR, setShowQR] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const {
    cameraAccess,
    webcamMountKey,
    isGranted: cameraGranted,
    showGate: showCameraGate,
    requestAccess,
    handleStreamError,
  } = useCameraGate({ active: showCamera })
  const [showAvatarSheet, setShowAvatarSheet] = useState(false)
  const [avatarSheetPhase, setAvatarSheetPhase] = useState<'choose' | 'uploading'>('choose')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)
  const webcamRef = useRef<Webcam>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { mounted: cameraMounted, screenClass: cameraScreenClass } = useOverlayTransition(
    showCamera,
    'slideUp',
    360
  )

  useEffect(() => {
    const navState = location.state as { openAvatarSheet?: boolean } | null
    if (navState?.openAvatarSheet) {
      setShowAvatarSheet(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!showCamera) setCameraReady(false)
  }, [showCamera])

  const handleWebcamReady = async () => {
    const video = webcamRef.current?.video
    if (!video) {
      setCameraReady(false)
      return
    }
    const live = await waitForLiveVideo(video)
    setCameraReady(live)
    if (!live) toastError(t('face.cameraNotReady'))
  }

  useEffect(() => {
    if (showAvatarSheet) {
      setAvatarSheetPhase('choose')
      setAvatarPreview(null)
    }
  }, [showAvatarSheet])

  function closeAvatarSheet() {
    if (uploading) return
    setShowAvatarSheet(false)
    setAvatarSheetPhase('choose')
    setAvatarPreview(null)
  }

  async function saveAvatar(base64: string) {
    setUploading(true)
    setAvatarPreview(base64)
    setAvatarSheetPhase('uploading')
    const previousAvatar = user.avatarUrl
    try {
      const { data: res } = await uploadAvatar(base64)
      await invalidateCachedImage(previousAvatar)
      const updatedUser = { ...user, avatarUrl: res.avatarUrl }
      setUser(updatedUser)
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setShowCamera(false)
      setShowAvatarSheet(false)
      setAvatarSheetPhase('choose')
      setAvatarPreview(null)
    } catch (e) {
      toastError(getApiErrorMessage(e, t('profile.avatarUploadFailed')))
      setAvatarSheetPhase('choose')
      setAvatarPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') resolve(result)
        else reject(new Error('read_failed'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
      reader.readAsDataURL(file)
    })
  }

  async function handleCaptureAvatar() {
    const video = webcamRef.current?.video
    if (!video || !cameraReady) {
      toastError(t('face.cameraNotReady'))
      return
    }
    const imageSrc = captureVideoFrame(video, { minWidth: 720, quality: 0.92, mirror: true })
    if (!imageSrc) {
      toastError(t('profile.cameraError'))
      return
    }
    await saveAvatar(imageSrc)
  }

  function handlePickFromGallery() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setAvatarSheetPhase('uploading')
    setUploading(true)
    try {
      const base64 = await readFileAsDataUrl(file)
      await saveAvatar(base64)
    } catch {
      toastError(t('profile.avatarUploadFailed'))
      setAvatarSheetPhase('choose')
      setAvatarPreview(null)
      setUploading(false)
    }
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
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] hover:text-on-surface hover:bg-[var(--color-surface-container-highest)] transition active:scale-95"
          aria-label={t('profile.myQr')}
        >
          <QrCode size={22} />
        </button>
        <h1 className="text-lg font-bold text-on-surface tracking-tight">{t('nav.profile')}</h1>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="p-3 rounded-full bg-[var(--color-surface-container-high)] text-[var(--color-on-surface-variant)] hover:text-on-surface hover:bg-[var(--color-surface-container-highest)] transition active:scale-95"
          aria-label={t('profile.settings')}
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
          aria-label={t('profile.changeAvatar')}
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
          <div className="relative z-10 w-28 h-28 rounded-full bg-[var(--color-surface-container-high)] border-2 border-subtle overflow-hidden flex items-center justify-center">
            {uploading && avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : user.avatarUrl ? (
              <CachedImage path={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-[var(--color-brand-primary)] leading-none select-none">
                {avatarInitial(user.nickname)}
              </span>
            )}
            {uploading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-[var(--color-brand-primary)]" />
                <span className="text-[10px] font-semibold text-white">{t('common.saving')}</span>
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition flex items-center justify-center">
                <Camera size={28} className="text-white" />
              </div>
            )}
          </div>
        </button>

        <h2 className="text-2xl font-extrabold text-on-surface tracking-tight">{user.nickname}</h2>
        <p className="mt-1 text-sm font-medium text-[var(--color-on-surface-variant)]">
          @{user.nickname}
        </p>
      </div>

      {/* Photos Grid */}
      <div>
        <h3 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
          {t('settings.selfies')}
        </h3>

        {loadingPhotos ? (
          <p className="text-[var(--color-on-surface-variant)] text-sm text-center py-10 opacity-70">
            {t('common.loading')}
          </p>
        ) : photos.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 flex flex-col items-center justify-center text-center border border-subtle">
            <ImageIcon
              size={32}
              className="text-[var(--color-on-surface-variant)] opacity-50 mb-3"
            />
            <p className="text-[var(--color-on-surface-variant)] text-sm font-medium">
              {t('settings.noSelfies')}
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
                className="w-full mt-6 py-4 rounded-full bg-[var(--color-surface-container-high)] text-on-surface font-bold hover:bg-[var(--color-surface-container-highest)] transition"
              >
                {t('common.retry')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Avatar sheet */}
      {showAvatarSheet && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-end backdrop-blur-sm"
          style={{ background: 'var(--map-modal-scrim)' }}
          onClick={closeAvatarSheet}
        >
          <div
            className="bg-[var(--color-surface-container-high)] rounded-t-3xl px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-overlay-scrim mx-auto mb-5" />
            <h3 className="text-lg font-bold text-on-surface mb-4 text-center">
              {t('settings.profilePhoto')}
            </h3>

            {avatarSheetPhase === 'uploading' ? (
              <div className="flex flex-col items-center py-4">
                <div className="mb-4 h-32 w-32 overflow-hidden rounded-full border-2 border-[var(--color-brand-primary)] bg-[var(--color-surface-container-highest)]">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--color-brand-primary)]" />
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold text-on-surface">{t('profile.savingAvatar')}</p>
                <p className="mt-1 text-xs text-[var(--color-on-surface-variant)]">
                  {t('common.savingPhoto')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAvatarSheet(false)
                    setShowCamera(true)
                  }}
                  className="w-full rounded-2xl bg-[var(--color-surface-container-highest)] py-4 text-on-surface font-semibold active:scale-[0.99] transition"
                >
                  {t('profile.takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={handlePickFromGallery}
                  className="w-full rounded-2xl bg-[var(--color-surface-container-highest)] py-4 text-on-surface font-semibold active:scale-[0.99] transition"
                >
                  {t('profile.pickFromGallery')}
                </button>
                <button
                  type="button"
                  onClick={closeAvatarSheet}
                  className="w-full py-4 text-[var(--color-on-surface-variant)] font-semibold"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ProfileQrModal nickname={user.nickname} open={showQR} onClose={() => setShowQR(false)} />

      {/* Camera Modal for Avatar */}
      {cameraMounted && (
        <div className={`fixed inset-0 z-[100] flex flex-col bg-black ${cameraScreenClass}`}>
          <div className="flex items-center justify-between p-6 pb-2">
            <h2 className="text-white font-bold text-xl">{t('settings.profilePhoto')}</h2>
            <button
              type="button"
              onClick={() => setShowCamera(false)}
              className="p-2 bg-zinc-900 rounded-full text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden rounded-3xl mx-4 mb-6 bg-zinc-900 flex items-center justify-center">
            {showCameraGate ? (
              <CameraGate
                access={cameraAccess}
                onRetry={() => void requestAccess()}
                variant="fullscreen"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900"
              />
            ) : cameraGranted ? (
              <Webcam
                key={webcamMountKey}
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: 'user', aspectRatio: 1 }}
                className={`camera-video w-full h-full object-cover max-w-md scale-x-[-1] ${cameraReady ? 'camera-video--ready' : ''}`}
                onUserMedia={() => void handleWebcamReady()}
                onUserMediaError={(err) => {
                  setCameraReady(false)
                  handleStreamError(err, () => toastError(t('profile.cameraError')))
                }}
              />
            ) : null}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 rounded-full border-4 border-[var(--color-brand-primary)] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
            </div>
          </div>

          <div className="px-6 pb-12">
            <button
              type="button"
              onClick={handleCaptureAvatar}
              disabled={uploading || !cameraReady || !cameraGranted}
              className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
            >
              {uploading ? t('common.saving') : t('profile.takePhoto')}
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
