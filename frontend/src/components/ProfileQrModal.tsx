import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { QRCode } from 'react-qr-code'
import { Scanner } from '@yudiel/react-qr-scanner'
import {
  profileUrl,
  parseQrScanTarget,
  searchUsers,
  requestFriend,
  findUserByScanTarget,
  getApiErrorMessage,
} from '../lib/api'
import { shareProfileLink } from '../lib/shareProfile'
import { useOverlayTransition } from '../lib/useOverlayTransition'
import { toastError, toastSuccess, toastLink } from '../lib/toast'

interface Props {
  nickname: string
  open: boolean
  onClose: () => void
}

export default function ProfileQrModal({ nickname, open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [showScanner, setShowScanner] = useState(false)
  const scanningRef = useRef(false)

  const visible = open || showScanner
  const { mounted, screenClass, panelClass } = useOverlayTransition(visible, 'fade')

  if (!mounted) return null

  async function handleShareProfile() {
    const url = profileUrl(nickname)
    const result = await shareProfileLink(nickname, url)

    if (result === 'copied') toastSuccess(t('profile.shareCopied'))
    if (result === 'failed') toastError(t('profile.shareFailed'))
  }

  function handleCloseAll() {
    setShowScanner(false)
    onClose()
  }

  if (showScanner) {
    return createPortal(
      <div
        className={`fixed inset-0 z-[100] flex flex-col bg-[var(--color-background)] ${screenClass}`}
      >
        <div className="flex items-center justify-between p-6 pb-2">
          <h2 className="text-xl font-bold text-on-surface">{t('common.qr')}</h2>
          <button
            type="button"
            onClick={() => setShowScanner(false)}
            className="btn btn--icon btn--secondary"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative mx-4 mb-12 flex flex-1 items-center justify-center overflow-hidden rounded-3xl bg-[var(--color-surface-container-low)]">
          <Scanner
            onScan={async (result) => {
              if (!result?.length || scanningRef.current) return
              scanningRef.current = true
              const target = parseQrScanTarget(result[0].rawValue)
              if (!target) {
                toastError(t('profile.invalidQr'))
                scanningRef.current = false
                return
              }
              try {
                const { data: users } = await searchUsers(target)
                const friend = findUserByScanTarget(users, target)
                if (!friend) {
                  toastError(t('profile.userNotFound'))
                  return
                }
                await requestFriend(friend.id)
                toastLink(t('profile.friendRequestSent'), '/', navigate, '👥')
                setShowScanner(false)
                onClose()
              } catch (e) {
                toastError(getApiErrorMessage(e, t('profile.qrRequestFailed')))
              } finally {
                scanningRef.current = false
              }
            }}
            components={{ finder: true }}
            styles={{ container: { width: '100%', height: '100%' } }}
          />
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center bg-[var(--color-background)]/95 p-6 backdrop-blur-md ${screenClass}`}
    >
      <div className={`mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col ${panelClass}`}>
        <div className="flex justify-start pt-6">
          <button
            type="button"
            onClick={handleCloseAll}
            className="btn btn--icon-lg btn--secondary"
            aria-label={t('common.back')}
          >
            <ArrowLeft size={24} />
          </button>
        </div>

        <div className="flex w-full flex-1 items-center justify-center py-6">
          <div className="glass-card relative flex w-full max-w-sm flex-col items-center overflow-hidden rounded-[32px] border border-subtle p-10">
            <div className="pointer-events-none absolute top-1/2 left-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-brand-primary)] opacity-10 blur-3xl" />
            <div className="relative z-10 mb-6 rounded-3xl bg-white p-5 shadow-[0_10px_30px_var(--map-control-shadow)]">
              <QRCode value={profileUrl(nickname)} size={200} />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-on-surface">@{nickname}</h2>
          </div>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4 pb-8">
          <button
            type="button"
            onClick={handleShareProfile}
            className="btn btn--primary btn--lg w-full"
          >
            {t('profile.shareDialogTitle')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              setShowScanner(true)
            }}
            className="btn btn--secondary btn--lg w-full"
          >
            {t('common.qr')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
