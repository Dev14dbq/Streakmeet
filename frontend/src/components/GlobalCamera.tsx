import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { Camera } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage, magicMeet, type AuthUser } from '../lib/api'
import { isAxiosError } from 'axios'
import { toastError, toastLink } from '../lib/toast'
import type { MagicMeetResultState } from '../pages/meet/MagicMeetResultPage'
import FullscreenCamera from './FullscreenCamera'

function logCapture(step: string, detail?: unknown) {
  console.log(`[magic-camera] ${step}`, detail ?? '')
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user')
      if (stored) setUser(JSON.parse(stored))
    } catch {
      /* ignore */
    }
  }, [])

  function openCamera() {
    if (!user?.faceEnrolled) {
      toastLink(t('camera.faceRequired'), '/face-enrollment', navigate, '👤')
      return
    }
    setProcessing(false)
    setProcessingLabel('')
    setCameraOpen(true)
    logCapture('camera opened')
  }

  const handleConfirm = useCallback(
    async (imageSrc: string) => {
      setProcessing(true)
      logCapture('confirm upload', { bytes: imageSrc.length })

      let location: { lat: number; lng: number } | undefined
      const geoEnabled = (() => {
        try {
          return (
            JSON.parse(localStorage.getItem('streakmeet_settings') || '{}').geoOnPhotos !== false
          )
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
      logCapture('POST /api/streaks/magic-meet')

      try {
        const { data } = await magicMeet({ photoBase64: imageSrc, location })
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
    [navigate, t]
  )

  if (!user) return null

  const cameraModal = cameraOpen
    ? createPortal(
        <FullscreenCamera
          open={cameraOpen}
          onClose={() => {
            if (!processing) setCameraOpen(false)
          }}
          onConfirm={handleConfirm}
          confirmLabel={t('camera.continue')}
          processing={processing}
          processingLabel={processingLabel || t('camera.processing')}
          closeDisabled={processing}
        />,
        document.body
      )
    : null

  const fabClass =
    variant === 'center'
      ? 'w-[68px] h-[68px] bg-[var(--color-brand-primary)] rounded-full shadow-[0_12px_36px_rgba(255,26,79,0.55)] ring-4 ring-black flex items-center justify-center text-white transition hover:scale-105 active:scale-95 pointer-events-auto touch-manipulation'
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
