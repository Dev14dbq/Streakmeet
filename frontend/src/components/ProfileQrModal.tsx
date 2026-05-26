import { useState, useRef } from 'react'
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

  if (!open && !showScanner) return null

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
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="flex items-center justify-between p-6 pb-2">
          <h2 className="text-white font-bold text-xl">{t('common.qr')}</h2>
          <button
            type="button"
            onClick={() => setShowScanner(false)}
            className="p-2 bg-zinc-900 rounded-full text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 relative overflow-hidden rounded-3xl mx-4 mb-12 bg-zinc-900 flex items-center justify-center">
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
      </div>
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center p-6">
      <div className="w-full max-w-[600px] flex justify-start pt-6">
        <button
          type="button"
          onClick={handleCloseAll}
          className="p-3 bg-[var(--color-surface-container-high)] rounded-full text-white transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={24} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center w-full">
        <div className="glass-card rounded-[32px] p-10 flex flex-col items-center relative overflow-hidden w-full max-w-sm">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[var(--color-brand-primary)] opacity-10 blur-3xl rounded-full pointer-events-none" />
          <div className="bg-white p-5 rounded-3xl mb-6 relative z-10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <QRCode value={profileUrl(nickname)} size={200} />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">@{nickname}</h2>
        </div>
      </div>

      <div className="w-full max-w-sm pb-8 flex flex-col gap-4">
        <button
          type="button"
          onClick={handleShareProfile}
          className="w-full rounded-full bg-[var(--color-brand-primary)] py-4 font-bold text-lg text-white transition active:scale-95 shadow-[0_8px_20px_rgba(255,26,79,0.3)]"
        >
          {t('profile.shareDialogTitle')}
        </button>
        <button
          type="button"
          onClick={() => {
            onClose()
            setShowScanner(true)
          }}
          className="w-full rounded-full bg-[var(--color-surface-container-high)] py-4 font-bold text-lg text-white transition active:scale-95 hover:bg-[var(--color-surface-container-highest)]"
        >
          {t('common.qr')}
        </button>
      </div>
    </div>
  )
}
