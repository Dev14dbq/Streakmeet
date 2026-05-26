import { useState, useRef, useEffect } from 'react'
import { X, MoreVertical, Download, Share, Info } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share as CapShare } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { toastError, toastSuccess } from '../lib/toast'
import CachedImage from './CachedImage'
import { resolveBackendImageUrl } from '../lib/remoteImageUrl'
import { useCachedImageSrc } from '../lib/useCachedImageSrc'

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
        toastSuccess('Фото сохранено в Документы')
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
        toastSuccess('Фото скачано')
      }
    } catch (e) {
      console.error('Download error:', e)
      toastError('Не удалось скачать фото')
    }
  }

  async function handleShare() {
    setMenuOpen(false)
    try {
      if (Capacitor.isNativePlatform() && cachedSrc?.startsWith('file://')) {
        await CapShare.share({
          title: 'Фото из StreakMeet',
          url: cachedSrc,
        })
      } else if (navigator.share) {
        // Web share API might not support sharing image blobs directly easily without File objects
        // Let's try to fetch and share as File
        const response = await fetch(remoteUrl)
        if (!response.ok) throw new Error('Share fetch failed')
        const blob = await response.blob()
        const file = new File([blob], `StreakMeet_${photo.id}.jpg`, { type: blob.type })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Фото из StreakMeet',
          })
        } else {
          await navigator.share({
            title: 'Фото из StreakMeet',
            url: remoteUrl,
          })
        }
      } else {
        toastError('Поделиться не поддерживается на этом устройстве')
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.error('Share error:', e)
      toastError('Не удалось поделиться фото')
    }
  }

  function handleInfo() {
    setMenuOpen(false)
    setInfoOpen(true)
  }

  const uploaderNickname = photo.uploadedBy?.nickname || 'Неизвестно'
  const dateStr = photo.createdAt ? new Date(photo.createdAt).toLocaleString() : 'Неизвестно'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] relative z-10 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
        >
          <X size={24} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
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
                Скачать
              </button>
              <button
                onClick={handleShare}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition"
              >
                <Share size={18} />
                Поделиться
              </button>
              <button
                onClick={handleInfo}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition"
              >
                <Info size={18} />
                Информация
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <CachedImage
          path={photo.photoUrl}
          alt="Фото встречи"
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>

      {/* Info Modal */}
      {infoOpen && (
        <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-center p-4 bg-black/50 animate-in fade-in">
          <div className="w-full max-w-sm bg-[var(--color-surface-container-high)] rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Информация о фото</h3>
              <button onClick={() => setInfoOpen(false)} className="text-white/50 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">
                  Кто сделал фото
                </p>
                <p className="text-sm text-white font-medium">@{uploaderNickname}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">Дата и время</p>
                <p className="text-sm text-white font-medium">{dateStr}</p>
              </div>
              {photo.latitude != null && photo.longitude != null && (
                <div>
                  <p className="text-xs text-[var(--color-on-surface-variant)] mb-1">Координаты</p>
                  <p className="text-sm text-white font-medium">
                    {photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
