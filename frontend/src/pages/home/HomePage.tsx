import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import ProfileQrModal from '../../components/ProfileQrModal'
import Avatar from '../../components/Avatar'
import { Flame, Search, UserPlus, Clock, QrCode } from 'lucide-react'
import useSWR from 'swr'
import { type AuthUser, fetcher, getApiErrorMessage } from '../../lib/api'
import { asArray } from '../../lib/asArray'
import { formatNickname } from '../../lib/displayUser'
import ConnectionErrorState from '../../components/ConnectionErrorState'
import { SWR_KEYS } from '../../lib/swrKeys'
import { isStreakMetToday } from '../../lib/streakCalendar'
import { isStreakActive, isStreakDead } from '../../lib/streakLifecycle'
import { useFriendSearch } from '../../hooks/useFriendSearch'
import type { StreakListItem, FriendListItem } from '@streakmeet/api-spec'
import { syncStreakWidget } from '../../lib/widgetSync'

interface Props {
  user: AuthUser
}

export default function HomePage({ user }: Props) {
  const { t } = useTranslation()
  const [showSearch, setShowSearch] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const {
    data,
    error: streaksError,
    mutate: mutateStreaks,
  } = useSWR<StreakListItem[]>(SWR_KEYS.streaks, fetcher)
  const streaks = asArray<StreakListItem>(data)
  const streaksInvalid = data != null && !Array.isArray(data)

  const {
    query,
    setQuery,
    searchResults,
    loadingSearch,
    friendsData,
    friendsError,
    friendsInvalid,
    mutateFriends,
    partition,
    handleAdd: doHandleAdd,
    handleAccept,
    handleStartStreak: doHandleStartStreak,
  } = useFriendSearch()

  const hasStreaksCache = Array.isArray(data)
  const hasFriendsCache = Array.isArray(friendsData)
  const streaksUnavailable = streaksInvalid || (!!streaksError && !hasStreaksCache)
  const friendsUnavailable = friendsInvalid || (!!friendsError && !hasFriendsCache)
  const showConnectionError = streaksUnavailable && friendsUnavailable
  const loadError = streaksError ?? friendsError
  const loadErrorMessage = loadError
    ? getApiErrorMessage(loadError, t('errors.noConnection'))
    : t('errors.noConnection')

  function retryLoad() {
    void mutateStreaks()
    void mutateFriends()
  }

  const { incoming, accepted, pendingOut } = partition

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  useEffect(() => {
    if (hasStreaksCache) void syncStreakWidget(streaks)
  }, [streaks, hasStreaksCache])

  async function handleAdd(id: string) {
    await doHandleAdd(id)
    setShowSearch(false)
  }

  async function handleStartStreak(friendId: string) {
    await doHandleStartStreak(friendId)
  }

  const streakPartnerIds = new Set(streaks.map((s) => s.partner.id))
  const canStartStreak = accepted.filter((f) => !streakPartnerIds.has(f.friend.id))

  const aliveStreaks = streaks.filter((s) => isStreakActive(s.lifecycle))
  const deadStreaks = streaks.filter((s) => isStreakDead(s.lifecycle))
  const needsMeetToday = aliveStreaks.filter((s) => !isStreakMetToday(s))

  function StreakCard({
    s,
    urgent,
    dead,
  }: {
    s: StreakListItem
    urgent?: boolean
    dead?: boolean
  }) {
    return (
      <Link
        to={`/streaks/${s.partner.nickname}`}
        className={`glass-card rounded-3xl p-5 flex flex-col relative overflow-hidden transition active:scale-[0.98] shadow-[0_10px_30px_rgba(0,0,0,0.4)] ${
          urgent ? 'ring-1 ring-[var(--color-brand-primary)]/40' : ''
        } ${dead ? 'ring-1 ring-amber-500/30' : ''}`}
      >
        {dead && (
          <span className="absolute top-3 left-3 z-10 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {s.lifecycle === 'DEAD_FINAL' ? t('streak.deadFinalBadge') : t('streak.deadBadge')}
          </span>
        )}
        {s.count > 0 && !dead && (
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-36 h-36 bg-[var(--color-brand-primary)] opacity-10 blur-3xl rounded-full pointer-events-none" />
        )}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar path={s.partner.avatarUrl} name={s.partner.nickname} />
            <div className="min-w-0">
              <h3 className="font-bold text-on-surface text-base tracking-tight truncate">
                {formatNickname(s.partner.nickname, t('common.unknownUser'))}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <span
              className={`text-3xl font-extrabold tracking-tighter ${
                dead
                  ? 'text-amber-400/90'
                  : s.count > 0
                    ? 'text-[var(--color-brand-primary)]'
                    : 'text-[var(--color-on-surface-variant)]'
              }`}
            >
              {dead ? (s.countAtDeath ?? 0) : s.count}
            </span>
            <Flame
              size={24}
              className={
                dead
                  ? 'text-amber-400/70'
                  : s.count > 0
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
    <div className="flex flex-col px-6 pt-4 pb-6 min-h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-on-surface tracking-tight">{t('home.title')}</h1>
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
                'home-add-bar__find btn btn--secondary w-full',
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
                className="field pl-14 pr-12"
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
            className="btn btn--icon-lg btn--soft home-add-bar__qr shrink-0"
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
                    <span className="font-bold text-on-surface truncate">
                      {formatNickname(u.nickname, t('common.unknownUser'))}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleAdd(u.id)}
                    className="btn btn--icon btn--primary ml-2 shrink-0"
                  >
                    <UserPlus size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showConnectionError ? (
        <ConnectionErrorState message={loadErrorMessage} onRetry={retryLoad} />
      ) : (
        <>
          {incoming.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.requests')} · {incoming.length}
              </h2>
              <div className="flex flex-col gap-2">
                {incoming.map((f: FriendListItem) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between glass-card p-4 rounded-2xl border border-[var(--color-brand-primary)]/25"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-on-surface truncate">
                        {formatNickname(f.friend.nickname, t('common.unknownUser'))}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAccept(f.id)}
                      className="btn btn--sm btn--primary shrink-0"
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
                {needsMeetToday.map((s: StreakListItem) => (
                  <StreakCard key={s.id} s={s} urgent />
                ))}
              </div>
            </section>
          )}

          {deadStreaks.length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-amber-400/90 uppercase tracking-widest mb-3">
                {t('home.deadStreaks')}
              </h2>
              <div className="flex flex-col gap-3">
                {deadStreaks.map((s: StreakListItem) => (
                  <StreakCard key={s.id} s={s} dead />
                ))}
              </div>
            </section>
          )}

          {aliveStreaks.filter((s) => isStreakMetToday(s)).length > 0 && (
            <section className="mb-6">
              <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-3">
                {t('home.streaks')}
              </h2>
              <div className="flex flex-col gap-3">
                {aliveStreaks
                  .filter((s) => isStreakMetToday(s))
                  .map((s: StreakListItem) => (
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
                {canStartStreak.map((f: FriendListItem) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between glass-card p-4 rounded-2xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-on-surface truncate">
                        {formatNickname(f.friend.nickname, t('common.unknownUser'))}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleStartStreak(f.friend.id)}
                      className="btn btn--sm btn--soft shrink-0"
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
                {pendingOut.map((f: FriendListItem) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between border border-subtle p-4 rounded-2xl opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar path={f.friend.avatarUrl} name={f.friend.nickname} size="sm" />
                      <span className="font-bold text-on-surface">
                        {formatNickname(f.friend.nickname, t('common.unknownUser'))}
                      </span>
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
              <h2 className="text-xl font-bold text-on-surface mb-2">{t('home.noFriendsYet')}</h2>
              <p className="mb-6 max-w-xs text-sm text-[var(--color-on-surface-variant)]">
                {t('home.emptyHint')}
              </p>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="btn btn--primary px-8"
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
