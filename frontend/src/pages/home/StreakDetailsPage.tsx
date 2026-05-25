import { useParams, useNavigate, Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Flame, ArrowLeft, Bell, Camera, Check, Image as ImageIcon } from 'lucide-react'
import useSWRInfinite from 'swr/infinite'
import { fetcher, remindStreak, type AuthUser } from '../../lib/api'
import { vibrateRemind } from '../../lib/haptics'
import { getLocalToday } from '../../lib/timezone'

const API_BASE = import.meta.env.VITE_API_URL || ''
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
}

interface StreakDay {
  id: string
  date: string
  meetProofs: MeetProof[]
}

function getRemindLabel(combo: number) {
  if (combo >= 20) return 'СПАМ!!!'
  if (combo >= 12) return 'ПИНГ-ПИНГ!'
  if (combo >= 6) return 'Ещё ещё!'
  if (combo >= 3) return 'Напомнить!'
  return 'Напомнить'
}

function daysLabel(count: number) {
  if (count === 1) return 'день'
  if (count >= 2 && count <= 4) return 'дня'
  return 'дней'
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

function DuoAvatar({
  url,
  label,
  onClick,
}: {
  url?: string | null
  label?: string
  onClick?: () => void
}) {
  const inner = (
    <>
      {url ? (
        <img src={API_BASE + url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xl">👤</span>
      )}
    </>
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
  const { nickname = '' } = useParams()
  const navigate = useNavigate()
  const today = getLocalToday()

  const me: AuthUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}') as AuthUser
    } catch {
      return {} as AuthUser
    }
  }, [])

  const getKey = (pageIndex: number, previousPageData: { streakDays?: StreakDay[] } | null) => {
    if (!nickname) return null
    if (previousPageData && !previousPageData.streakDays?.length) return null
    return `/api/streaks/${encodeURIComponent(nickname.toLowerCase())}?page=${pageIndex + 1}&limit=10`
  }

  const { data, size, setSize, error } = useSWRInfinite(getKey, fetcher)

  const loading = !data && !error
  const streakMeta = data?.[0]
  const streakDays: StreakDay[] = data ? data.flatMap((page) => page.streakDays) : []
  const isReachingEnd = data && data[data.length - 1]?.streakDays.length < 10
  const totalPhotos = streakDays.reduce((n, d) => n + d.meetProofs.length, 0)
  const coverPhoto = streakDays[0]?.meetProofs[0]?.photoUrl ?? null

  const [combo, setCombo] = useState(0)
  const [totalPings, setTotalPings] = useState(0)
  const [particles, setParticles] = useState<Particle[]>([])
  const [pulseKey, setPulseKey] = useState(0)
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Flame
            size={32}
            className="text-[var(--color-brand-primary)] animate-pulse"
            fill="currentColor"
          />
          <p className="text-sm text-[var(--color-on-surface-variant)]">Загрузка серии...</p>
        </div>
      </div>
    )
  }

  if (error || !streakMeta) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 gap-4">
        <p className="text-[var(--color-on-surface-variant)] text-center">Серия не найдена</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full bg-[var(--color-surface-container-high)] px-6 py-3 text-white font-semibold"
        >
          На главную
        </button>
      </div>
    )
  }

  const partner = streakMeta.userAId === me.id ? streakMeta.userB : streakMeta.userA
  const metToday = streakMeta.lastMetDate === today
  const count = streakMeta.count

  return (
    <div ref={pageRef} className="flex flex-col min-h-full">
      {/* Duo hero */}
      <section className="relative mx-4 mt-4 rounded-[28px] overflow-hidden border border-white/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
        <div className="absolute inset-0">
          {coverPhoto ? (
            <>
              <img
                src={API_BASE + coverPhoto}
                alt=""
                className="w-full h-full object-cover scale-110 blur-2xl opacity-50"
              />
              <img
                src={API_BASE + coverPhoto}
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

        <div className="relative px-5 pt-5 pb-6">
          <div className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-md text-white border border-white/10 transition active:scale-95"
              aria-label="Назад"
            >
              <ArrowLeft size={20} />
            </button>
            <Link
              to={`/${partner.nickname}`}
              className="rounded-full bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 text-xs font-bold text-white/90 transition hover:text-[var(--color-brand-primary)] active:scale-95"
            >
              @{partner.nickname}
            </Link>
          </div>

          {/* Duo row */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <DuoAvatar
              url={me.avatarUrl}
              label="Мой профиль"
              onClick={() => navigate('/profile')}
            />
            <div className="flex flex-col items-center min-w-[88px]">
              <div className="flex items-center gap-1 leading-none">
                <span className="text-5xl font-black text-white tracking-tighter tabular-nums">
                  {count}
                </span>
                <Flame
                  size={32}
                  className="text-[var(--color-brand-primary)] drop-shadow-[0_0_16px_rgba(255,26,79,0.7)] -mt-1"
                  fill="currentColor"
                />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--color-on-surface-variant)] mt-1">
                {daysLabel(count)}
              </span>
            </div>
            <DuoAvatar
              url={partner.avatarUrl}
              label={`Профиль @${partner.nickname}`}
              onClick={() => navigate(`/${partner.nickname}`)}
            />
          </div>

          <div className="flex flex-col items-center gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold backdrop-blur-md border ${
                metToday
                  ? 'bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)] border-[var(--color-brand-primary)]/25'
                  : 'bg-white/5 text-white border-white/10'
              }`}
            >
              {metToday ? (
                <>
                  <Check size={15} strokeWidth={3} />
                  Сегодня встретились
                </>
              ) : (
                <>
                  <Flame
                    size={15}
                    fill="currentColor"
                    className="text-[var(--color-brand-primary)]"
                  />
                  Сегодня ещё не встречались
                </>
              )}
            </div>
            {totalPhotos > 0 && (
              <p className="text-xs text-[var(--color-on-surface-variant)] font-medium">
                {totalPhotos} фото вместе
              </p>
            )}
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
              x{combo} КОМБО
            </div>
          )}

          <button
            type="button"
            onClick={handleRemind}
            className={`relative w-full overflow-hidden rounded-full py-[18px] font-black text-lg tracking-wide transition active:scale-[0.96] select-none ${
              combo >= 10
                ? 'bg-gradient-to-r from-[#ff0040] via-[#ff1a4f] to-[#ff6b00] text-white shadow-[0_0_40px_rgba(255,26,79,0.6)]'
                : combo >= 5
                  ? 'bg-[var(--color-brand-primary)] text-white shadow-[0_8px_30px_rgba(255,26,79,0.45)]'
                  : 'bg-[var(--color-brand-primary)]/20 text-[var(--color-brand-primary)] border border-[var(--color-brand-primary)]/40'
            }`}
          >
            <span key={pulseKey} className="remind-pulse-ring" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Bell size={22} className={combo >= 5 ? 'animate-bounce' : ''} />
              {getRemindLabel(combo)}
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
              Отправлено напоминаний: {totalPings}
              {combo >= 8 ? ' — ты монстр 🔔' : ''}
            </p>
          )}
        </div>
      )}

      {/* Gallery */}
      <div className="px-4 mt-8 pb-4">
        <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-5">
          История встреч
        </h2>

        {streakDays.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 flex flex-col items-center text-center border border-white/5">
            <Camera size={36} className="text-[var(--color-on-surface-variant)] opacity-40 mb-4" />
            <p className="text-white font-semibold mb-1">Пока нет фото</p>
            <p className="text-sm text-[var(--color-on-surface-variant)] leading-relaxed max-w-[240px]">
              Сфотографируйтесь через камеру внизу — здесь появится ваша лента
            </p>
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
                      <p className="text-sm font-semibold text-white/80 mb-3 capitalize">
                        {new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                        {day.date === today && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-[var(--color-brand-primary)]">
                            сегодня
                          </span>
                        )}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {day.meetProofs.map((proof) => (
                          <div
                            key={proof.id}
                            className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] group"
                          >
                            <img
                              src={API_BASE + proof.photoUrl}
                              alt=""
                              className="w-full h-full object-cover transition duration-500 group-active:scale-[1.02]"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                          </div>
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
                className="w-full py-4 rounded-full bg-[var(--color-surface-container-high)] text-white font-bold hover:bg-[var(--color-surface-container-highest)] transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <ImageIcon size={18} />
                Загрузить ещё
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
