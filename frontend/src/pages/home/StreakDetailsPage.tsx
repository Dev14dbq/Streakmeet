import { useParams, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Smartphone,
  Trash2,
  User,
  X,
} from 'lucide-react'
import useSWRInfinite from 'swr/infinite'
import {
  deleteStreak,
  initRemoteSelfie,
  replyRemoteSelfie,
  restartStreak,
  restoreStreak,
  updateStreakPet,
  getApiErrorMessage,
} from '../../lib/api'
import { showRewardedAdForStreakRestore } from '../../lib/rewardedAd'
import { isStreakActive, isStreakDead, isStreakDeadFinal } from '../../lib/streakLifecycle'
import { migratedApi } from '../../lib/api/migratedClient'
import { useSyncModeReady } from '../../hooks/useSyncModeReady'
import CachedImage from '../../components/CachedImage'
import { avatarInitial } from '../../lib/avatarInitial'
import { formatNickname } from '../../lib/displayUser'
import { useCachedImageSrc } from '../../lib/useCachedImageSrc'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'
import RemoteSelfieCameraModal from '../../components/RemoteSelfieCameraModal'
import { isStreakMetToday } from '../../lib/streakCalendar'
import { formatDate, formatMonthYear } from '../../i18n/format'
import { toastError, toastSuccess } from '../../lib/toast'
import { prepareImageDataUrlForUpload } from '../../lib/prepareImageUpload'
import { useAuth } from '../../context/AuthContext'

const DEFAULT_PET_NAME = 'Серийчик'

interface MeetProof {
  id: string
  photoUrl: string
  latitude?: number | null
  longitude?: number | null
  createdAt?: string
  uploadedBy?: { id: string; nickname: string }
}

interface StreakDay {
  id: string
  date: string
  meetProofs?: MeetProof[]
}

interface StreakPartner {
  id: string
  nickname: string
  avatarUrl?: string | null
}

interface StreakDetailPage {
  id: string
  petName?: string
  count: number
  lastMetDate?: string | null
  timezone: string
  petProgress?: {
    points: number
    level: number
    pointsInLevel: number
    nextLevelPoints: number
    pointsToNextLevel: number
  }
  dailyTasks?: {
    id: string
    titleKey: string
    points: number
    completed: boolean
  }[]
  lifecycle?: string
  countAtDeath?: number | null
  restoresLeft?: number
  userA: StreakPartner
  userB: StreakPartner
  remoteSelfies?: {
    id: string
    senderId: string
    receiverId: string
    senderPhotoUrl: string
    needsReply?: boolean
    sender?: { id: string; nickname: string }
  }[]
  streakDays?: StreakDay[]
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return formatMonthYear(y!, m!)
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function DuoAvatar({
  path,
  name,
  label,
}: {
  path?: string | null
  name?: string | null
  label?: string
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const initial = avatarInitial(name)
  const showImage = Boolean(path) && !imgFailed
  const src = useCachedImageSrc(showImage ? path : null)

  useEffect(() => {
    setImgFailed(false)
  }, [path])

  const inner =
    showImage && src ? (
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    ) : initial ? (
      <span className="text-2xl font-bold text-[var(--color-brand-primary)] leading-none select-none">
        {initial}
      </span>
    ) : (
      <User size={28} className="text-[var(--color-on-surface-variant)] opacity-70" aria-hidden />
    )

  return (
    <div
      className="relative w-14 h-14 rounded-full border-[3px] border-white/70 overflow-hidden bg-white/15 shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
      aria-label={label}
    >
      {inner}
    </div>
  )
}

function SeriychikSvg() {
  return (
    <svg
      viewBox="0 0 220 260"
      className="w-[184px] max-w-full drop-shadow-[0_28px_40px_rgba(116,35,7,0.36)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="seriychikFlame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff176" />
          <stop offset="42%" stopColor="#ff9f1c" />
          <stop offset="100%" stopColor="#ff1a4f" />
        </linearGradient>
        <linearGradient id="seriychikBelly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7ad" />
          <stop offset="100%" stopColor="#ffbf3f" />
        </linearGradient>
      </defs>
      <path
        d="M112 12c18 38-17 49 12 82 13-23 38-31 41-67 40 42 47 92 25 132-16 30-46 48-80 48-50 0-87-31-87-76 0-43 33-65 44-96 13 23 30 28 45-23Z"
        fill="url(#seriychikFlame)"
      />
      <path
        d="M112 83c17 27-16 38 5 62 10-17 27-22 29-47 27 29 33 64 17 91-11 20-31 31-54 31-35 0-61-21-61-52 0-30 23-45 31-67 9 16 21 20 33-18Z"
        fill="url(#seriychikBelly)"
      />
      <path
        d="M48 150c-26 3-38 21-36 39"
        fill="none"
        stroke="#8f2b17"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M171 150c26 3 38 21 36 39"
        fill="none"
        stroke="#8f2b17"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <circle cx="86" cy="134" r="9" fill="#4b1d12" />
      <circle cx="134" cy="134" r="9" fill="#4b1d12" />
      <path
        d="M91 165c13 12 27 12 40 0"
        fill="none"
        stroke="#4b1d12"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="73" cy="153" rx="12" ry="7" fill="#ff6b73" opacity="0.55" />
      <ellipse cx="147" cy="153" rx="12" ry="7" fill="#ff6b73" opacity="0.55" />
      <path
        d="M82 215c-9 13-9 22 4 27"
        fill="none"
        stroke="#4b1d12"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M137 215c9 13 9 22-4 27"
        fill="none"
        stroke="#4b1d12"
        strokeWidth="13"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function StreakDetailsPage() {
  const { t } = useTranslation()
  const { nickname = '' } = useParams()
  const navigate = useNavigate()
  const syncReady = useSyncModeReady()

  const { user: me } = useAuth()
  const partnerSlug = nickname.trim().toLowerCase()

  const detailFetcher = useCallback(
    (url: string) =>
      migratedApi()
        .get<StreakDetailPage>(url)
        .then((res) => res.data),
    []
  )

  const getKey = useCallback(
    (pageIndex: number, previousPageData: StreakDetailPage | null) => {
      if (!syncReady || !me || !partnerSlug) return null
      if (previousPageData && !(previousPageData.streakDays?.length ?? 0)) return null
      return `/api/streaks/${encodeURIComponent(partnerSlug)}?page=${pageIndex + 1}&limit=10`
    },
    [syncReady, me, partnerSlug]
  )

  const { data, size, setSize, error, isLoading, mutate } = useSWRInfinite(getKey, detailFetcher, {
    revalidateOnMount: true,
    revalidateFirstPage: true,
  })

  const loading = isLoading
  const streakMeta = data?.[0]
  const streakDays: StreakDay[] = data ? data.flatMap((page) => page.streakDays ?? []) : []
  const isReachingEnd = data != null && (data[data.length - 1]?.streakDays?.length ?? 0) < 10

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRemoteSelfieCamera, setShowRemoteSelfieCamera] = useState(false)
  const [remoteSelfieUploading, setRemoteSelfieUploading] = useState(false)
  const [remoteSelfieMode, setRemoteSelfieMode] = useState<'init' | 'reply'>('init')
  const [replyingToRequest, setReplyingToRequest] = useState<string | null>(null)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restartBusy, setRestartBusy] = useState(false)

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, StreakDay[]>()
    for (const day of streakDays) {
      const key = monthKey(day.date)
      const list = map.get(key) ?? []
      list.push(day)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [streakDays])

  useEffect(() => {
    function onNotification(event: Event) {
      const detail = (event as CustomEvent<{ type?: string }>).detail
      if (!detail?.type?.startsWith('remote_selfie')) return
      void mutate()
    }
    window.addEventListener('app-notification', onNotification)
    return () => window.removeEventListener('app-notification', onNotification)
  }, [mutate])

  useEffect(() => {
    if (!me || !streakMeta || !nickname) return
    if (!/^c[a-z0-9]{20,}$/i.test(nickname)) return
    const partner = streakMeta.userA.id === me.id ? streakMeta.userB : streakMeta.userA
    if (partner?.nickname) {
      navigate(`/streaks/${partner.nickname}`, { replace: true })
    }
  }, [streakMeta, nickname, navigate, me])

  const handleSendRemoteSelfie = useCallback(
    async (photoBase64: string): Promise<boolean> => {
      if (!streakMeta) return false

      setRemoteSelfieUploading(true)
      try {
        const prepared = await prepareImageDataUrlForUpload(photoBase64)
        if (replyingToRequest) {
          const { data } = await replyRemoteSelfie(streakMeta.id, replyingToRequest, prepared)
          if (data.success) {
            toastSuccess(t('streak.selfieMerged'))
            setSize(1)
          }
        } else {
          await initRemoteSelfie(streakMeta.id, prepared)
          toastSuccess(t('streak.selfieRequestSent'))
          setSize(1)
        }
        setShowRemoteSelfieCamera(false)
        setReplyingToRequest(null)
        return true
      } catch (e) {
        toastError(getApiErrorMessage(e, t('streak.selfieError')))
        return false
      } finally {
        setRemoteSelfieUploading(false)
      }
    },
    [replyingToRequest, streakMeta, setSize, t]
  )

  function openRemoteSelfieInit() {
    setRemoteSelfieMode('init')
    setReplyingToRequest(null)
    setShowRemoteSelfieCamera(true)
  }

  function openRemoteSelfieReply(requestId: string) {
    setRemoteSelfieMode('reply')
    setReplyingToRequest(requestId)
    setShowRemoteSelfieCamera(true)
  }

  function openRename() {
    setDraftName(streakMeta?.petName || DEFAULT_PET_NAME)
    setRenameOpen(true)
    setMenuOpen(false)
  }

  async function saveName() {
    if (!streakMeta) return
    const nextName = draftName.trim()
    if (!nextName) return

    setSavingName(true)
    try {
      await updateStreakPet(streakMeta.id, nextName)
      await mutate()
      setRenameOpen(false)
      toastSuccess(t('streak.petNameSaved'))
    } catch (e) {
      toastError(getApiErrorMessage(e, t('streak.petNameSaveFailed')))
    } finally {
      setSavingName(false)
    }
  }

  async function confirmDelete() {
    if (!streakMeta) return

    setDeleting(true)
    try {
      await deleteStreak(streakMeta.id)
      toastSuccess(t('streak.deleted'))
      navigate('/')
    } catch (e) {
      toastError(getApiErrorMessage(e, t('streak.deleteFailed')))
    } finally {
      setDeleting(false)
    }
  }

  async function handleRestoreStreak() {
    if (!partnerSlug || restoreBusy) return
    setRestoreBusy(true)
    try {
      await showRewardedAdForStreakRestore()
      await restoreStreak(partnerSlug)
      toastSuccess(t('streak.restoreSuccess'))
      void mutate()
    } catch (e) {
      const msg = getApiErrorMessage(e, t('streak.restoreFailed'))
      if (msg.includes('ADS_CLOSED')) toastError(t('streak.adClosed'))
      else if (msg.includes('ADS_')) toastError(t('streak.adFailed'))
      else toastError(msg)
    } finally {
      setRestoreBusy(false)
    }
  }

  async function handleRestartStreak() {
    if (!partnerSlug || restartBusy) return
    setRestartBusy(true)
    try {
      await restartStreak(partnerSlug)
      toastSuccess(t('streak.restartSuccess'))
      void mutate()
    } catch (e) {
      toastError(getApiErrorMessage(e, t('streak.restoreFailed')))
    } finally {
      setRestartBusy(false)
    }
  }

  if (!me) return null

  if (!syncReady || (loading && !streakMeta)) {
    return null
  }

  if (error || !streakMeta) {
    const message = error ? getApiErrorMessage(error, t('streak.loadFailed')) : t('streak.notFound')
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 gap-4">
        <p className="text-[var(--color-on-surface-variant)] text-center">{message}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn--secondary">
          {t('notFound.goHome')}
        </button>
      </div>
    )
  }

  const partner = streakMeta.userA.id === me.id ? streakMeta.userB : streakMeta.userA
  const lifecycle = streakMeta.lifecycle ?? 'ACTIVE'
  const streakDead = isStreakDead(lifecycle)
  const streakDeadFinal = isStreakDeadFinal(lifecycle)
  const metToday = isStreakActive(lifecycle) && isStreakMetToday(streakMeta)
  const count = streakDead ? (streakMeta.countAtDeath ?? 0) : streakMeta.count
  const restoresLeft = streakMeta.restoresLeft ?? 0
  const petName = streakMeta.petName || DEFAULT_PET_NAME
  const progress = streakMeta.petProgress ?? {
    points: 0,
    level: 1,
    pointsInLevel: 0,
    nextLevelPoints: 100,
    pointsToNextLevel: 100,
  }
  const progressPercent = Math.min(
    100,
    Math.round((progress.pointsInLevel / Math.max(progress.nextLevelPoints, 1)) * 100)
  )
  const dailyTasks = streakMeta.dailyTasks ?? []

  const pendingRemoteSelfie = streakMeta?.remoteSelfies?.[0]
  const isMyRequest = pendingRemoteSelfie?.senderId === me.id

  return (
    <div className="flex flex-col min-h-full bg-[var(--color-background)]">
      <section className="relative overflow-hidden rounded-b-[36px] px-4 pt-4 pb-8 text-white shadow-[0_24px_70px_rgba(86,28,3,0.42)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(255,255,255,0.32),transparent_24%),radial-gradient(circle_at_78%_20%,rgba(255,226,128,0.42),transparent_24%),linear-gradient(145deg,#ff9f1c_0%,#ff4d32_42%,#8b1d73_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/20 to-transparent" />

        <div className="relative">
          <div className="flex items-start justify-between">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="grid h-11 w-11 place-items-center rounded-full bg-black/22 text-white backdrop-blur-md border border-white/20 active:scale-95"
              aria-label={t('streak.exit')}
            >
              <X size={22} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="grid h-11 w-11 place-items-center rounded-full bg-black/22 text-white backdrop-blur-md border border-white/20 active:scale-95"
                aria-label={t('streak.moreActions')}
              >
                <MoreHorizontal size={24} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-13 z-20 w-56 overflow-hidden rounded-2xl bg-[var(--color-surface-container-high)] text-on-surface shadow-[0_18px_46px_rgba(0,0,0,0.45)] border border-white/10">
                  <button
                    type="button"
                    onClick={openRename}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold active:bg-white/5"
                  >
                    <Pencil size={17} />
                    {t('streak.changePetName')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setDeleteConfirmOpen(true)
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-red-300 active:bg-red-500/10"
                  >
                    <Trash2 size={17} />
                    {t('streak.killStreak')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <p className="text-[13px] font-black uppercase tracking-[0.2em] text-white/76">
                {t('streak.streakDaysLabel')}
              </p>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-6xl font-black leading-none tracking-[-0.08em] tabular-nums">
                  {count}
                </span>
                <DuoAvatar
                  path={partner.avatarUrl}
                  name={partner.nickname}
                  label={t('streak.partnerProfile', { nickname: partner.nickname })}
                />
              </div>
              <p className="mt-2 max-w-[150px] truncate text-xs font-bold text-white/72">
                @{formatNickname(partner.nickname, t('common.unknownUser'))}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-col items-center text-center">
            <SeriychikSvg />
            <div className="mt-[-8px] flex items-center justify-center gap-2">
              <h1 className="text-3xl font-black tracking-tight">{petName}</h1>
              <button
                type="button"
                onClick={openRename}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/18 text-white backdrop-blur-md active:scale-95"
                aria-label={t('streak.changePetName')}
              >
                <Pencil size={15} />
              </button>
            </div>
            <div className="mt-4 w-full rounded-full bg-white/22 p-1 shadow-inner">
              <div
                className="h-4 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.55)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex w-full items-center justify-between text-xs font-black text-white/82">
              <span>{t('streak.level', { level: progress.level })}</span>
              <span>
                {progress.pointsInLevel}/{progress.nextLevelPoints}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-white/78">
              {t('streak.pointsToNextLevel', { count: progress.pointsToNextLevel })}
            </p>
          </div>
        </div>
      </section>

      {streakDead && (
        <section className="px-4 -mt-2 relative z-10">
          <div className="glass-card rounded-3xl p-5 border border-amber-500/25 bg-amber-500/5">
            <h2 className="text-lg font-black text-amber-200 mb-2">
              {streakDeadFinal ? t('streak.deadFinalTitle') : t('streak.deadTitle')}
            </h2>
            <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed mb-4">
              {streakDeadFinal ? t('streak.deadFinalBody') : t('streak.deadBody', { count })}
            </p>
            {streakDeadFinal ? (
              <button
                type="button"
                disabled={restartBusy}
                onClick={() => void handleRestartStreak()}
                className="btn btn--lg w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black"
              >
                {restartBusy ? t('common.loading') : t('streak.restartSeries')}
              </button>
            ) : (
              <>
                <p className="text-xs text-amber-200/80 mb-3 font-semibold">
                  {t('streak.restoreLeft', { left: restoresLeft })}
                </p>
                <button
                  type="button"
                  disabled={restoreBusy || restoresLeft <= 0}
                  onClick={() => void handleRestoreStreak()}
                  className="btn btn--lg w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black disabled:opacity-50"
                >
                  {restoreBusy ? t('common.loading') : t('streak.restoreViaAd')}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <main className="px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {!streakDead && (
          <section>
            <h2 className="text-2xl font-black tracking-tight text-on-surface">
              {t('streak.growTitle')}
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {dailyTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-3xl bg-[var(--color-surface-container)] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)] border border-white/5"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)]">
                    <CheckCircle2 size={21} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-on-surface">{t(task.titleKey)}</p>
                    <p className="text-xs font-semibold text-[var(--color-on-surface-variant)]">
                      {t('streak.taskRefreshesDaily')}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--color-brand-primary)]/16 px-3 py-1 text-sm font-black text-[var(--color-brand-primary)]">
                    {t('streak.taskPoints', { count: task.points })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!streakDead && (
          <section className="mt-6">
            {pendingRemoteSelfie && !isMyRequest ? (
              <button
                type="button"
                onClick={() => openRemoteSelfieReply(pendingRemoteSelfie.id)}
                className="btn btn--lg w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-on-surface shadow-[0_8px_30px_rgba(139,92,246,0.4)]"
              >
                <Camera size={20} />
                {t('camera.sendReply')}{' '}
                {formatNickname(
                  pendingRemoteSelfie.sender?.nickname ?? partner.nickname,
                  t('common.unknownUser')
                )}
              </button>
            ) : pendingRemoteSelfie && isMyRequest ? (
              <div className="w-full rounded-full py-4 bg-white/5 border border-white/10 text-[var(--color-on-surface-variant)] font-medium text-sm text-center flex items-center justify-center gap-2">
                <Smartphone size={18} />
                {t('common.loading')} {formatNickname(partner.nickname, t('common.unknownUser'))}...
              </div>
            ) : !metToday ? (
              <button
                type="button"
                onClick={openRemoteSelfieInit}
                className="btn btn--secondary btn--lg w-full"
              >
                <Smartphone size={18} />
                {t('camera.meetPhoto')}
              </button>
            ) : null}
          </section>
        )}

        <section className="mt-8">
          {streakDays.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 flex flex-col items-center text-center border border-white/5">
              <Camera
                size={36}
                className="text-[var(--color-on-surface-variant)] opacity-40 mb-4"
              />
              <p className="text-on-surface font-semibold">{t('home.noResults')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {groupedByMonth.map(([key, days]) => (
                <section key={key}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)] mb-4 capitalize">
                    {monthLabel(key)}
                  </p>
                  <div className="flex flex-col gap-6">
                    {days.map((day) => (
                      <div key={day.id}>
                        <p className="text-sm font-semibold text-on-surface/80 mb-3 capitalize">
                          {formatDate(day.date + 'T12:00:00', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {(day.meetProofs ?? []).map((proof) => (
                            <button
                              key={proof.id}
                              type="button"
                              onClick={() =>
                                setSelectedPhoto({
                                  ...proof,
                                  streakDay: {
                                    streak: {
                                      userA: streakMeta.userA,
                                      userB: streakMeta.userB,
                                    },
                                  },
                                } as PhotoData)
                              }
                              className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] group text-left"
                            >
                              <CachedImage
                                path={proof.photoUrl}
                                alt=""
                                className="w-full h-full object-cover transition duration-500 group-active:scale-[1.02]"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {!isReachingEnd && (
                <button
                  type="button"
                  onClick={() => setSize(size + 1)}
                  className="btn btn--secondary btn--lg w-full"
                >
                  <ImageIcon size={18} />
                  {t('common.retry')}
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {renameOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/58 px-4 pb-4 pt-10 backdrop-blur-sm">
          <div className="w-full rounded-[28px] bg-[var(--color-surface-container-high)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-black text-on-surface">{t('streak.changePetName')}</h2>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={24}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-on-surface outline-none focus:border-[var(--color-brand-primary)]"
              placeholder={DEFAULT_PET_NAME}
              autoFocus
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                className="btn btn--secondary btn--lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={saveName}
                disabled={savingName || !draftName.trim()}
                className="btn btn--primary btn--lg disabled:opacity-50"
              >
                {savingName ? t('common.saving') : t('common.change')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/62 px-4 pb-4 pt-10 backdrop-blur-sm">
          <div className="w-full rounded-[28px] bg-[var(--color-surface-container-high)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-black text-on-surface">{t('streak.killStreak')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
              {t('streak.killConfirm')}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="btn btn--secondary btn--lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="btn btn--lg bg-red-500 text-white disabled:opacity-50"
              >
                {deleting ? t('common.loading') : t('streak.killConfirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <PhotoViewerModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}

      <RemoteSelfieCameraModal
        open={showRemoteSelfieCamera}
        mode={remoteSelfieMode}
        friendPhotoUrl={pendingRemoteSelfie?.senderPhotoUrl}
        friendNickname={pendingRemoteSelfie?.sender?.nickname}
        uploading={remoteSelfieUploading}
        onClose={() => {
          if (remoteSelfieUploading) return
          setShowRemoteSelfieCamera(false)
          setReplyingToRequest(null)
        }}
        onSend={handleSendRemoteSelfie}
      />
    </div>
  )
}
