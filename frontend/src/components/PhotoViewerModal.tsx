import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, MoreVertical, Download, Share, Info } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share as CapShare } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { toastError, toastSuccess } from '../lib/toast'
import CachedImage from './CachedImage'
import { resolveBackendImageUrl } from '../lib/remoteImageUrl'
import { useCachedImageSrc } from '../lib/useCachedImageSrc'
import { formatDateTime } from '../i18n/format'

export interface PhotoData {
  id: string
  photoUrl: string
  latitude?: number | null
  longitude?: number | null
  createdAt?: string
  uploadedBy?: { id: string; nickname: string }
  streakDay: {
    streak: {
      userA: { id: string; nickname: string }
      userB: { id: string; nickname: string }
    }
  }
}

interface Props {
  photo: PhotoData
  onClose: () => void
}

export default function PhotoViewerModal({ photo, onClose }: Props) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const cachedSrc = useCachedImageSrc(photo.photoUrl) || ''
  const remoteUrl = resolveBackendImageUrl(photo.photoUrl) || ''

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function handleDownload() {
    setMenuOpen(false)
    try {
      if (Capacitor.isNativePlatform()) {
        const fileName = `StreakMeet_${photo.id}.jpg`
        await Filesystem.downloadFile({
          url: remoteUrl,
          path: fileName,
          directory: Directory.Documents,
        })
        toastSuccess(t('photo.savedDocuments'))
      } else {
        const response = await fetch(remoteUrl)
        if (!response.ok) throw new Error('Download failed')
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `StreakMeet_${photo.id}.jpg`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        toastSuccess(t('photo.downloaded'))
      }
    } catch (e) {
      console.error('Download error:', e)
      toastError(t('photo.downloadFailed'))
    }
  }

  async function handleShare() {
    setMenuOpen(false)
    try {
      if (Capacitor.isNativePlatform() && cachedSrc?.startsWith('file://')) {
        await CapShare.share({
          title: t('photo.shareTitle'),
          url: cachedSrc,
        })
      } else if (navigator.share) {
        const response = await fetch(remoteUrl)
        if (!response.ok) throw new Error('Share fetch failed')
        const blob = await response.blob()
        const file = new File([blob], `StreakMeet_${photo.id}.jpg`, { type: blob.type })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: t('photo.shareTitle'),
          })
        } else {
          await navigator.share({
            title: t('photo.shareTitle'),
            url: remoteUrl,
          })
        }
      } else {
        toastError(t('photo.shareNotSupported'))
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('Share error:', e)
      toastError(t('photo.shareFailed'))
    }
  }

  function handleInfo() {
    setMenuOpen(false)
    setInfoOpen(true)
  }

  const uploaderNickname = photo.uploadedBy?.nickname || t('common.unknown')
  const dateStr = photo.createdAt ? formatDateTime(photo.createdAt) : t('common.unknown')

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] relative z-10 shrink-0">
        <button
          onClick={onClose}
          className="btn btn--icon bg-white/10 text-white hover:bg-white/20"
        >
          <X size={24} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="btn btn--icon bg-white/10 text-white hover:bg-white/20"
          >
            <MoreVertical size={24} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[var(--color-surface-container-highest)] border border-white/10 shadow-xl overflow-hidden py-1 animate-in slide-in-from-top-2">
              <button
                onClick={handleDownload}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition"
              >
                <Download size={18} />
                {t('photo.downloaded')}
              </button>
              <button
                onClick={handleShare}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition"
              >
                <Share size={18} />
                {t('profile.shareDialogTitle')}
              </button>
              <button
                onClick={handleInfo}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition"
              >
                <Info size={18} />
                {t('settings.about')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <CachedImage
          path={photo.photoUrl}
          alt={t('photo.meetPhoto')}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>

      {infoOpen && (
        <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="w-full max-w-sm bg-[var(--color-surface-container-high)] rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="flex justify-end mb-2">
              <button onClick={() => setInfoOpen(false)} className="text-white/50 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-white font-medium">@{uploaderNickname}</p>
              <p className="text-sm text-white font-medium">{dateStr}</p>
              {photo.latitude != null && photo.longitude != null && (
                <p className="text-sm text-white font-medium">
                  {photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
