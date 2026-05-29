import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useSWR from 'swr'
import { isAxiosError } from 'axios'
import {
  getApiErrorMessage,
  initRemoteSelfie,
  magicMeet,
  replyRemoteSelfie,
  type AuthUser,
} from '../lib/api'
import { SWR_KEYS } from '../lib/swrKeys'
import { toastError, toastLink, toastSuccess } from '../lib/toast'
import type { MagicMeetResultState } from '../pages/meet/MagicMeetResultPage'
import FullscreenCamera, { type CameraCaptureMode } from './FullscreenCamera'
import CameraRemotePartnerPicker, { type StreakPartnerOption } from './CameraRemotePartnerPicker'
import CachedImage from './CachedImage'

function logCapture(step: string, detail?: unknown) {
  console.log(`[magic-camera] ${step}`, detail ?? '')
}

interface RemoteTarget {
  streakId: string
  partnerNickname: string
  mode: 'init' | 'reply'
  requestId?: string
  friendPhotoUrl?: string
}

interface Props {
  variant?: 'side' | 'center'
}

export default function GlobalCamera({ variant = 'side' }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingLabel, setProcessingLabel] = useState('')
  const [captureMode, setCaptureMode] = useState<CameraCaptureMode>('meet')
  const [remoteTarget, setRemoteTarget] = useState<RemoteTarget | null>(null)
  const [showPartnerPicker, setShowPartnerPicker] = useState(false)

  interface StreakListItem {
    id: string
    partner: StreakPartnerOption['partner']
    pendingRemoteSelfie?: StreakPartnerOption['pendingRemoteSelfie']
  }

  const { data: streaksRaw = [], mutate: mutateStreaks } = useSWR<StreakListItem[]>(
    cameraOpen ? SWR_KEYS.streaks : null
  )

  const partnerOptions: StreakPartnerOption[] = useMemo(
    () =>
      streaksRaw.map((s) => ({
        streakId: s.id,
        partner: s.partner,
        pendingRemoteSelfie: s.pendingRemoteSelfie ?? null,
      })),
    [streaksRaw]
  )

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) setUser(JSON.parse(stored))
    } catch {
      /* ignore */
    }
  }, [])

  const resetRemoteState = useCallback(() => {
    setCaptureMode('meet')
    setRemoteTarget(null)
    setShowPartnerPicker(false)
  }, [])

  const applyRemoteTarget = useCallback((streak: StreakPartnerOption, mode: 'init' | 'reply') => {
    const pending = streak.pendingRemoteSelfie
    setRemoteTarget({
      streakId: streak.streakId,
      partnerNickname:
        mode === 'reply'
          ? (pending?.senderNickname ?? streak.partner.nickname)
          : streak.partner.nickname,
      mode,
      requestId: mode === 'reply' ? pending?.id : undefined,
      friendPhotoUrl: mode === 'reply' ? pending?.senderPhotoUrl : undefined,
    })
    setShowPartnerPicker(false)
  }, [])

  const enterRemoteMode = useCallback(() => {
    setCaptureMode('remote')
    const incoming = partnerOptions.filter((s) => s.pendingRemoteSelfie?.needsReply)
    if (incoming.length === 1) {
      applyRemoteTarget(incoming[0]!, 'reply')
      return
    }
    if (incoming.length > 1) {
      setRemoteTarget(null)
      setShowPartnerPicker(true)
      return
    }
    setRemoteTarget(null)
    setShowPartnerPicker(true)
  }, [partnerOptions, applyRemoteTarget])

  const handleCaptureModeChange = useCallback(
    (mode: CameraCaptureMode) => {
      if (mode === 'meet') {
        resetRemoteState()
        return
      }
      enterRemoteMode()
    },
    [resetRemoteState, enterRemoteMode]
  )

  function openCamera() {
    if (!user?.faceEnrolled) {
      toastLink(t('camera.faceRequired'), '/face-enrollment', navigate, '👤')
      return
    }
    setProcessing(false)
    setProcessingLabel('')
    resetRemoteState()
    setCameraOpen(true)
    logCapture('camera opened')
  }

  const handleConfirm = useCallback(
    async (imageSrc: string, burst?: string[]) => {
      setProcessing(true)
      logCapture('confirm upload', {
        bytes: imageSrc.length,
        mode: captureMode,
        burst: burst?.length ?? 1,
      })

      if (captureMode === 'remote') {
        if (!remoteTarget) {
          toastError(t('camera.choosePartner'))
          setProcessing(false)
          return
        }

        setProcessingLabel(
          remoteTarget.mode === 'reply' ? t('camera.sending') : t('camera.processing')
        )

        try {
          if (remoteTarget.mode === 'reply' && remoteTarget.requestId) {
            const { data } = await replyRemoteSelfie(
              remoteTarget.streakId,
              remoteTarget.requestId,
              imageSrc
            )
            if (data.success) {
              toastSuccess(t('streak.selfieMerged'))
            }
          } else {
            await initRemoteSelfie(remoteTarget.streakId, imageSrc)
            toastSuccess(t('streak.selfieRequestSent'))
          }
          void mutateStreaks()
          setCameraOpen(false)
          resetRemoteState()
        } catch (e: unknown) {
          toastError(getApiErrorMessage(e, t('streak.selfieError')))
        } finally {
          setProcessing(false)
        }
        return
      }

      let location: { lat: number; lng: number } | undefined
      const geoEnabled = (() => {
        try {
          return (() => {
            try {
              const u = JSON.parse(localStorage.getItem('user') || '{}')
              if (u.geoOnPhotos === false) return false
              const s = JSON.parse(localStorage.getItem('streakmeet_settings') || '{}')
              return s.geoOnPhotos !== false
            } catch {
              return true
            }
          })()
        } catch {
          return true
        }
      })()

      if (geoEnabled) {
        setProcessingLabel(t('camera.gettingLocation'))
        logCapture('requesting geolocation')
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
          )
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          logCapture('geolocation ok', location)
        } catch (e) {
          logCapture('geolocation skipped', e)
        }
      }

      setProcessingLabel(t('camera.recognizing'))
      logCapture('POST /api/streaks/magic-meet', { frames: burst?.length ?? 1 })

      try {
        const photosBase64 = burst && burst.length > 1 ? burst : undefined
        const { data } = await magicMeet({
          photoBase64: imageSrc,
          photosBase64,
          location,
        })
        logCapture('success', data)

        const resultState: MagicMeetResultState = {
          photo: imageSrc,
          message: data.message,
          partners: data.partners ?? [],
        }

        setCameraOpen(false)
        setProcessing(false)
        navigate('/magic-meet/success', { state: resultState, replace: true })
      } catch (e: unknown) {
        const msg = getApiErrorMessage(e, t('camera.verifyError'))
        logCapture('api error', {
          msg,
          status: isAxiosError(e) ? e.response?.status : undefined,
          code: isAxiosError(e) ? e.code : undefined,
        })
        toastError(msg)
        setProcessing(false)
      }
    },
    [captureMode, remoteTarget, navigate, t, mutateStreaks, resetRemoteState]
  )

  const modeOptions = useMemo(
    () => [
      { id: 'meet' as const, label: t('camera.modeMeet') },
      { id: 'remote' as const, label: t('camera.modeRemote') },
    ],
    [t]
  )

  const isRemoteReply = captureMode === 'remote' && remoteTarget?.mode === 'reply'
  const splitTop =
    isRemoteReply && remoteTarget?.friendPhotoUrl ? (
      <CachedImage
        path={remoteTarget.friendPhotoUrl}
        alt=""
        className="w-full h-full object-cover"
      />
    ) : undefined

  if (!user) return null

  const cameraModal = cameraOpen
    ? createPortal(
        <FullscreenCamera
          open={cameraOpen}
          onClose={() => {
            if (!processing) {
              setCameraOpen(false)
              resetRemoteState()
            }
          }}
          onConfirm={handleConfirm}
          confirmLabel={t('camera.continue')}
          processing={processing}
          processingLabel={processingLabel || t('camera.processing')}
          closeDisabled={processing}
          captureMode={captureMode}
          onCaptureModeChange={handleCaptureModeChange}
          modeOptions={modeOptions}
          splitTop={splitTop}
          splitTopLabel={
            isRemoteReply && remoteTarget ? `@${remoteTarget.partnerNickname}` : undefined
          }
          shutterDisabled={captureMode === 'remote' && !remoteTarget}
          burstFrames={captureMode === 'meet' ? 3 : 1}
          bottomOverlay={
            captureMode === 'remote' && showPartnerPicker ? (
              <CameraRemotePartnerPicker streaks={partnerOptions} onSelect={applyRemoteTarget} />
            ) : undefined
          }
          onCancelRemote={captureMode === 'remote' ? resetRemoteState : undefined}
        />,
        document.body
      )
    : null

  const fabClass =
    variant === 'center'
      ? 'w-[68px] h-[68px] bg-[var(--color-brand-primary)] rounded-full shadow-[0_12px_36px_rgba(255,26,79,0.55)] ring-4 ring-[var(--color-background)] flex items-center justify-center text-white transition hover:scale-105 active:scale-95 pointer-events-auto touch-manipulation'
      : 'w-[60px] h-[60px] shrink-0 bg-[var(--color-brand-primary)] rounded-full shadow-[0_8px_30px_rgba(255,26,79,0.4)] flex items-center justify-center text-white transition hover:bg-[var(--color-primary-container)] active:scale-90 pointer-events-auto touch-manipulation'

  return (
    <>
      <button
        type="button"
        onClick={openCamera}
        className={fabClass}
        aria-label={t('profile.takePhoto')}
      >
        <Camera size={variant === 'center' ? 30 : 28} />
      </button>
      {cameraModal}
    </>
  )
}
