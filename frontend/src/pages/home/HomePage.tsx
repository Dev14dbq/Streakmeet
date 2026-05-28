import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import ProfileQrModal from '../../components/ProfileQrModal'
import Avatar from '../../components/Avatar'
import { Flame, Search, UserPlus, Clock, QrCode } from 'lucide-react'
import useSWR from 'swr'
import {
  searchUsers,
  requestFriend,
  acceptFriend,
  createStreak,
  getApiErrorMessage,
  type AuthUser,
} from '../../lib/api'
import { SWR_KEYS } from '../../lib/swrKeys'
import { toastError, toastSuccess } from '../../lib/toast'
import { isStreakMetToday } from '../../lib/streakCalendar'

interface Props {
  user: AuthUser
}

export default function HomePage({ user }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<
    { id: string; nickname: string; avatarUrl?: string }[]
  >([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const {
    data: streaks = [],
    error: streaksError,
    mutate: mutateStreaks,
  } = useSWR(SWR_KEYS.streaks)
  const { data: friends = [], mutate: mutateFriends } = useSWR(SWR_KEYS.friends)

  const loading = !streaks && !streaksError

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  useEffect(() => {
    if (query.length < 3) {
      setSearchResults([])
      setSearchError(false)
      return
    }
    const timer = setTimeout(async () => {
      setLoadingSearch(true)
      setSearchError(false)
      try {
        const { data } = await searchUsers(query)
        setSearchResults(data)
      } catch (e) {
        setSearchResults([])
        setSearchError(true)
        toastError(getApiErrorMessage(e, t('home.searchFailed')))
      } finally {
        setLoadingSearch(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const incoming = friends.filter((f: { isIncomingRequest?: boolean }) => f.isIncomingRequest)
  const accepted = friends.filter((f: { status: string }) => f.status === 'ACCEPTED')
  const pendingOut = friends.filter(
    (f: { status: string; isIncomingRequest?: boolean }) =>
      f.status === 'PENDING' && !f.isIncomingRequest
  )

  const streakPartnerIds = new Set(streaks.map((s: { partner: { id: string } }) => s.partner.id))
  const canStartStreak = accepted.filter(
    (f: { friend: { id: string } }) => !streakPartnerIds.has(f.friend.id)
  )

  const needsMeetToday = streaks.filter(
    (s: { lastMetDate?: string; timezone?: string }) => !isStreakMetToday(s)
  )

  async function handleAdd(id: string) {
    try {
      await requestFriend(id)
      setQuery('')
      setShowSearch(false)
      mutateFriends()
      toastSuccess(t('home.requestSent'))
    } catch (e) {
      toastError(getApiErrorMessage(e, t('home.requestFailed')))
    }
  }

  async function handleAccept(friendshipId: string) {
    try {
      await acceptFriend(friendshipId)
      mutateFriends()
      toastSuccess(t('home.requestAccepted'))
    } catch (e) {
      toastError(getApiErrorMessage(e, t('home.acceptFailed')))
    }
  }

  async function handleStartStreak(friendId: string) {
    try {
      await createStreak(friendId)
      mutateStreaks()
      mutateFriends()
      toastSuccess(t('home.streakStarted'))
    } catch (e) {
      toastError(getApiErrorMessage(e, t('home.streakStartFailed')))
    }
  }

  function StreakCard({ s, urgent }: { s: any; urgent?: boolean }) {
    return (
      <Link
        to={`/streaks/${s.partner.nickname}`}
        className={`glass-card rounded-3xl p-5 flex flex-col relative overflow-hidden transition active:scale-[0.98] shadow-[0_10px_30px_rgba(0,0,0,0.4)] ${
          urgent ? 'ring-1 ring-[var(--color-brand-primary)]/40' : ''
        }`}
      >
        {s.count > 0 && (
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 bg-[var(--color-brand-primary)] opacity-10 blur-3xl rounded-full pointer-events-none" />
        )}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar path={s.partner.avatarUrl} name={s.partner.nickname} />
            <div className="min-w-0">
              <h3 className="font-bold text-white text-base tracking-tight truncate">
                @{s.partner.nickname}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <span
              className={`text-3xl font-extrabold tracking-tighter ${
                s.count > 0
                  ? 'text-[var(--color-brand-primary)]'
                  : 'text-[var(--color-on-surface-variant)]'
              }`}
            >
              {s.count}
            </span>
            <Flame
              size={24}
              className={
                s.count > 0
                  ? 'text-[var(--color-brand-primary)]'
                  : 'text-[var(--color-on-surface-variant)]'
              }
              fill="currentColor"
            />
          </div>
        </div>
      </Link>
    )
  }

  return (
    <div className="flex flex-col px-6 pt-12 pb-6 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">{t('home.title')}</h1>
        <div className="flex items-center gap-2 bg-[var(--color-surface-container-high)] px-4 py-2 rounded-full">
          <span className="text-[var(--color-brand-primary)] font-extrabold text-sm">
            {user.gemsBalance ?? 0}
          </span>
          <span className="text-[10px] text-[var(--color-on-surface-variant)] font-bold tracking-wider uppercase">
            {t('common.gems')}
          </span>
        </div>
      </div>

      {/* Добавить человека */}
      <div className="mb-6">
        <div className="home-add-bar flex gap-2 items-stretch">
          <div className="home-add-bar__primary relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              aria-hidden={showSearch}
              tabIndex={showSearch ? -1 : 0}
              className={[
                'home-add-bar__find flex w-full items-center justify-center gap-2 rounded-full',
                'bg-[var(--color-surface-container-high)] py-3.5 text-sm font-semibold text-white',
                'transition hover:bg-[var(--color-surface-container-highest)] active:scale-[0.98]',
                showSearch ? 'home-add-bar__find--hidden' : '',
              ].join(' ')}
            >
              <Search size={18} />
              {t('home.findPerson')}
            </button>

            <div
              className={[
                'home-add-bar__search relative',
                showSearch ? 'home-add-bar__search--open' : '',
              ].join(' ')}
              aria-hidden={!showSearch}
            >
              <Search
                className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-[var(--color-on-surface-variant)]"
                size={20}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('home.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                tabIndex={showSearch ? 0 : -1}
                className="w-full rounded-full bg-[var(--color-surface-container-high)] py-3.5 pl-14 pr-12 text-white outline-none transition focus:ring-2 focus:ring-[var(--color-brand-primary)]"
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false)
                  setQuery('')
                }}
                tabIndex={showSearch ? 0 : -1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--color-on-surface-variant)]"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="home-add-bar__qr flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)] transition hover:bg-[var(--color-brand-primary)]/25 active:scale-[0.96]"
            aria-label={t('profile.myQr')}
          >
            <QrCode size={22} strokeWidth={2.25} />
          </button>
        </div>

        {showSearch && query.length >= 3 && (
          <div className="mt-3 flex flex-col gap-2">
            {loadingSearch ? (
              <p className="text-[var(--color-on-surface-variant)] text-sm py-2">
                {t('common.searching')}
              </p>
            ) : searchError ? (
              <p className="text-[var(--color-error)] text-sm py-2">{t('home.searchError')}</p>
            ) : searchResults.length === 0 ? (
              <p className="text-[var(--color-on-surface-variant)] text-sm py-2">
                {t('home.noResults')}
              </p>
            ) : (
              searchResults.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between glass-card p-3 rounded-2xl"
                >
                  <Link
                    to={`/${u.nickname}`}
                    onClick={() => {
                      setShowSearch(false)
                      setQuery('')
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 active:opacity-80"
                  >
                    <Avatar path={u.avatarUrl} name={u.nickname} size="sm" />
                    <span className="font-bold text-white truncate">@{u.nickname}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleAdd(u.id)}
                    className="p-2.5 bg-[var(--color-brand-primary)] text-white rounded-full active:scale-95 shrink-0 ml-2"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-500 text-center py-10">{t('common.loading')}</p>
      ) : streaksError ? (
        <div className="glass-card rounded-3xl p-8 text-center border border-white/5">
          <p className="text-white font-semibold mb-2">{t('home.loadFailed')}</p>
          <button
            type="button"
            onClick={() => mutateStreaks()}
            className="text-sm font-bold text-[var(--color-brand-primary)]"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          {incoming.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.requests')} · {incoming.length}
              </h2>
              <div className="flex flex-col gap-2">
                {incoming.map((f: any) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between glass-card p-4 rounded-2xl border border-[var(--color-brand-primary)]/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-white truncate">@{f.friend.nickname}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAccept(f.id)}
                      className="px-4 py-2 bg-[var(--color-brand-primary)] text-white text-sm font-bold rounded-full active:scale-95 shrink-0"
                    >
                      {t('common.accept')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {needsMeetToday.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-brand-primary)] uppercase tracking-widest mb-3">
                {t('home.todayMeet')}
              </h2>
              <div className="flex flex-col gap-3">
                {needsMeetToday.map((s: any) => (
                  <StreakCard key={s.id} s={s} urgent />
                ))}
              </div>
            </section>
          )}

          {streaks.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.streaks')}
              </h2>
              <div className="flex flex-col gap-3">
                {streaks
                  .filter((s: any) => isStreakMetToday(s))
                  .map((s: any) => (
                    <StreakCard key={s.id} s={s} />
                  ))}
              </div>
            </section>
          )}

          {canStartStreak.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.startStreak')}
              </h2>
              <div className="flex flex-col gap-2">
                {canStartStreak.map((f: any) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between glass-card p-4 rounded-2xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-white truncate">@{f.friend.nickname}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartStreak(f.friend.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[var(--color-brand-primary)]/15 text-[var(--color-brand-primary)] text-sm font-bold rounded-full active:scale-95 shrink-0"
                    >
                      <Flame size={16} fill="currentColor" />
                      {t('home.streak')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pendingOut.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.pending')}
              </h2>
              <div className="flex flex-col gap-2">
                {pendingOut.map((f: any) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between border border-white/5 p-4 rounded-2xl opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-white">@{f.friend.nickname}</span>
                    </div>
                    <span className="text-xs text-[var(--color-on-surface-variant)] flex items-center gap-1">
                      <Clock size={14} /> {t('home.waiting')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {streaks.length === 0 && accepted.length === 0 && incoming.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-24 h-24 bg-[var(--color-surface-container-high)] rounded-full flex items-center justify-center mb-6">
                <Flame size={40} className="text-[var(--color-on-surface-variant)] opacity-50" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">{t('home.noFriendsYet')}</h2>
              <p className="mb-6 max-w-xs text-sm text-[var(--color-on-surface-variant)]">
                {t('home.emptyHint')}
              </p>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="rounded-full bg-[var(--color-brand-primary)] px-8 py-3.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(255,26,79,0.3)] active:scale-95"
              >
                {t('home.findPerson')}
              </button>
            </div>
          )}
        </>
      )}

      <ProfileQrModal nickname={user.nickname} open={showQr} onClose={() => setShowQr(false)} />
    </div>
  )
}
