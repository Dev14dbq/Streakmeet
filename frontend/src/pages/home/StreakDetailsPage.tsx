import { useParams, useNavigate, Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, ArrowLeft, Bell, Camera, Image as ImageIcon, Smartphone } from 'lucide-react'
import useSWRInfinite from 'swr/infinite'
import {
  fetcher,
  remindStreak,
  initRemoteSelfie,
  replyRemoteSelfie,
  getApiErrorMessage,
} from '../../lib/api'
import CachedImage from '../../components/CachedImage'
import { avatarInitial } from '../../lib/avatarInitial'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'
import RemoteSelfieCameraModal from '../../components/RemoteSelfieCameraModal'
import { vibrateRemind } from '../../lib/haptics'
import { isStreakMetToday } from '../../lib/streakCalendar'
import { formatDate, formatMonthYear } from '../../i18n/format'
import { toastError, toastSuccess } from '../../lib/toast'
import { useAuth } from '../../context/AuthContext'

const PARTICLE_EMOJIS = ['🔔', '🔥', '⚡', '💥', '📣', '👋', '❗', '💫']

interface Particle {
  id: number
  x: number
  emoji: string
  spin: number
}

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
  meetProofs: MeetProof[]
}

function getRemindLabel(combo: number, t: (key: string) => string) {
  if (combo >= 20) return t('streak.spam')
  if (combo >= 12) return t('streak.pingPing')
  if (combo >= 6) return t('streak.remindMore')
  if (combo >= 3) return `${t('streak.remind')}!`
  return t('streak.remind')
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
  onClick,
}: {
  path?: string | null
  name?: string | null
  label?: string
  onClick?: () => void
}) {
  const inner = path ? (
    <CachedImage path={path} alt="" className="w-full h-full object-cover" />
  ) : (
    <span className="text-2xl font-bold text-[var(--color-brand-primary)] leading-none select-none">
      {avatarInitial(name)}
    </span>
  )

  const cls =
    'relative w-[72px] h-[72px] rounded-full border-[3px] border-black/80 overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]'

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} active:scale-95 transition`}
        aria-label={label}
      >
        {inner}
      </button>
    )
  }

  return <div className={cls}>{inner}</div>
}

export default function StreakDetailsPage() {
  const { t } = useTranslation()
  const { nickname = '' } = useParams()
  const navigate = useNavigate()

  const { user: me } = useAuth()
  if (!me) return null

  const getKey = (pageIndex: number, previousPageData: { streakDays?: StreakDay[] } | null) => {
    if (!nickname) return null
    if (previousPageData && !previousPageData.streakDays?.length) return null
    return `/api/streaks/${encodeURIComponent(nickname.toLowerCase())}?page=${pageIndex + 1}&limit=10`
  }

  const { data, size, setSize, error, mutate } = useSWRInfinite(getKey, fetcher)

  const loading = !data && !error
  const streakMeta = data?.[0]
  const streakDays: StreakDay[] = data ? data.flatMap((page) => page.streakDays) : []
  const isReachingEnd = data && data[data.length - 1]?.streakDays.length < 10
  const coverPhoto = streakDays[0]?.meetProofs[0]?.photoUrl ?? null

  const [combo, setCombo] = useState(0)
  const [totalPings, setTotalPings] = useState(0)
  const [particles, setParticles] = useState<Particle[]>([])
  const [pulseKey, setPulseKey] = useState(0)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)

  const [showRemoteSelfieCamera, setShowRemoteSelfieCamera] = useState(false)
  const [remoteSelfieUploading, setRemoteSelfieUploading] = useState(false)
  const [remoteSelfieMode, setRemoteSelfieMode] = useState<'init' | 'reply'>('init')
  const [replyingToRequest, setReplyingToRequest] = useState<string | null>(null)

  const comboTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const particleId = useRef(0)
  const pageRef = useRef<HTMLDivElement>(null)

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
    if (!streakMeta || !nickname) return
    if (!/^c[a-z0-9]{20,}$/i.test(nickname)) return
    const partner = streakMeta.userAId === me.id ? streakMeta.userB : streakMeta.userA
    if (partner?.nickname) {
      navigate(`/streaks/${partner.nickname}`, { replace: true })
    }
  }, [streakMeta, nickname, navigate, me.id])

  const spawnParticles = useCallback((count: number) => {
    const next: Particle[] = []
    for (let i = 0; i < count; i++) {
      next.push({
        id: particleId.current++,
        x: 15 + Math.random() * 70,
        emoji: PARTICLE_EMOJIS[Math.floor(Math.random() * PARTICLE_EMOJIS.length)]!,
        spin: -30 + Math.random() * 60,
      })
    }
    setParticles((prev) => [...prev, ...next].slice(-40))
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !next.some((n) => n.id === p.id)))
    }, 950)
  }, [])

  const triggerScreenShake = useCallback(() => {
    const el = pageRef.current
    if (!el) return
    el.classList.remove('screen-shake')
    void el.offsetHeight
    el.classList.add('screen-shake')
  }, [])

  const handleRemind = useCallback(async () => {
    if (!nickname) return

    setCombo((c) => {
      const next = c + 1
      spawnParticles(next >= 10 ? 6 : next >= 5 ? 4 : 2)
      vibrateRemind(next)
      return next
    })
    setTotalPings((n) => n + 1)
    triggerScreenShake()
    setPulseKey((k) => k + 1)

    if (comboTimer.current) clearTimeout(comboTimer.current)
    comboTimer.current = setTimeout(() => setCombo(0), 1800)

    try {
      await remindStreak(nickname)
    } catch {
      /* визуал работает даже если офлайн */
    }
  }, [nickname, spawnParticles, triggerScreenShake])

  const handleSendRemoteSelfie = useCallback(
    async (photoBase64: string) => {
      if (!streakMeta) return

      setRemoteSelfieUploading(true)
      try {
        if (replyingToRequest) {
          const { data } = await replyRemoteSelfie(streakMeta.id, replyingToRequest, photoBase64)
          if (data.success) {
            toastSuccess(t('streak.selfieMerged'))
            setSize(1)
          }
        } else {
          await initRemoteSelfie(streakMeta.id, photoBase64)
          toastSuccess(t('streak.selfieRequestSent'))
          setSize(1)
        }
        setShowRemoteSelfieCamera(false)
        setReplyingToRequest(null)
      } catch (e) {
        toastError(getApiErrorMessage(e, t('streak.selfieError')))
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Flame
            size={32}
            className="text-[var(--color-brand-primary)] animate-pulse"
            fill="currentColor"
          />
          <p className="text-sm text-[var(--color-on-surface-variant)]">{t('common.loading')}</p>
        </div>
      </div>
    )
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

  const partner = streakMeta.userAId === me.id ? streakMeta.userB : streakMeta.userA
  const metToday = isStreakMetToday(streakMeta)
  const count = streakMeta.count

  const pendingRemoteSelfie = streakMeta?.remoteSelfies?.[0]
  const isMyRequest = pendingRemoteSelfie?.senderId === me.id

  return (
    <div
      ref={pageRef}
      className="flex flex-col min-h-full pt-[calc(env(safe-area-inset-top)+1.25rem)]"
    >
      {/* Duo hero */}
      <section className="relative mx-4 mt-2 rounded-[28px] overflow-hidden border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="absolute inset-0">
          {coverPhoto ? (
            <>
              <CachedImage
                path={coverPhoto}
                alt=""
                className="w-full h-full object-cover scale-110 blur-2xl opacity-50"
              />
              <CachedImage
                path={coverPhoto}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-30"
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#2a0812] via-[#121317] to-[#121317]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[#121317]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,26,79,0.18)_0%,transparent_65%)]" />
        </div>

        <div className="relative px-5 pt-6 pb-6">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn--icon bg-black/40 text-on-surface backdrop-blur-md border border-white/10"
              aria-label={t('common.back')}
            >
              <ArrowLeft size={20} />
            </button>
            <Link
              to={`/${partner.nickname}`}
              className="btn btn--sm bg-black/40 text-on-surface/90 backdrop-blur-md border border-white/10 hover:text-[var(--color-brand-primary)]"
            >
              @{partner.nickname}
            </Link>
          </div>

          {/* Duo row */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <DuoAvatar
              path={me.avatarUrl}
              name={me.nickname}
              label={t('streak.myProfile')}
              onClick={() => navigate('/profile')}
            />
            <div className="flex flex-col items-center min-w-[88px]">
              <div className="flex items-center gap-1 leading-none">
                <span className="text-5xl font-black text-on-surface tracking-tighter tabular-nums">
                  {count}
                </span>
                <Flame
                  size={32}
                  className="text-[var(--color-brand-primary)] drop-shadow-[0_0_16px_rgba(255,26,79,0.7)] -mt-1"
                  fill="currentColor"
                />
              </div>
            </div>
            <DuoAvatar
              path={partner.avatarUrl}
              name={partner.nickname}
              label={t('streak.partnerProfile', { nickname: partner.nickname })}
              onClick={() => navigate(`/${partner.nickname}`)}
            />
          </div>
        </div>
      </section>

      {/* Remind */}
      {!metToday && (
        <div className="px-4 mt-5 relative z-10">
          {combo >= 3 && (
            <div
              key={combo}
              className="remind-combo-badge absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1 rounded-full bg-[var(--color-brand-primary)] text-white text-xs font-black tracking-wider shadow-[0_4px_20px_rgba(255,26,79,0.5)]"
            >
              x{combo}
            </div>
          )}

          <button
            type="button"
            onClick={handleRemind}
            className={`relative w-full overflow-hidden rounded-full py-[18px] font-black text-lg tracking-wide transition active:scale-[0.96] select-none ${
              combo >= 10
                ? 'bg-gradient-to-r from-[#ff0040] via-[#ff1a4f] to-[#ff6b00] text-on-surface shadow-[0_0_40px_rgba(255,26,79,0.6)]'
                : combo >= 5
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-[0_8px_30px_rgba(255,26,79,0.45)]'
                  : 'bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-primary)] border border-[var(--color-brand-primary)]/40'
            }`}
          >
            <span key={pulseKey} className="remind-pulse-ring" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Bell size={22} className={combo >= 5 ? 'animate-bounce' : ''} />
              {getRemindLabel(combo, t)}
            </span>

            {particles.map((p) => (
              <span
                key={p.id}
                className="remind-particle"
                style={
                  {
                    left: `${p.x}%`,
                    bottom: '50%',
                    '--spin': `${p.spin}deg`,
                  } as React.CSSProperties
                }
              >
                {p.emoji}
              </span>
            ))}
          </button>

          {totalPings > 0 && (
            <p className="text-center text-[11px] text-[var(--color-on-surface-variant)] mt-2 opacity-80">
              {totalPings}
              {combo >= 8 ? t('streak.monster') : ''}
            </p>
          )}
        </div>
      )}

      {/* Remote Selfie Section */}
      <div className="px-4 mt-4 relative z-10">
        {pendingRemoteSelfie && !isMyRequest ? (
          <button
            type="button"
            onClick={() => openRemoteSelfieReply(pendingRemoteSelfie.id)}
            className="btn btn--lg w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-on-surface shadow-[0_8px_30px_rgba(139,92,246,0.4)]"
          >
            <Camera size={20} />
            {t('camera.sendReply')} @{pendingRemoteSelfie.sender.nickname}
          </button>
        ) : pendingRemoteSelfie && isMyRequest ? (
          <div className="w-full rounded-full py-4 bg-white/5 border border-white/10 text-[var(--color-on-surface-variant)] font-medium text-sm text-center flex items-center justify-center gap-2">
            <Smartphone size={18} />
            {t('common.loading')} @{partner.nickname}...
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
      </div>

      {/* Gallery */}
      <div className="px-4 mt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {streakDays.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 flex flex-col items-center text-center border border-white/5">
            <Camera size={36} className="text-[var(--color-on-surface-variant)] opacity-40 mb-4" />
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
                        {day.meetProofs.map((proof) => (
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
      </div>

      {selectedPhoto && (
        <PhotoViewerModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}

      <RemoteSelfieCameraModal
        open={showRemoteSelfieCamera}
        mode={remoteSelfieMode}
        friendPhotoUrl={pendingRemoteSelfie?.senderPhotoUrl}
        friendNickname={pendingRemoteSelfie?.sender.nickname}
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
