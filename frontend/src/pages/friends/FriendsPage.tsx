import { useState, useEffect } from 'react'
import { Search, UserPlus, Clock } from 'lucide-react'
import useSWR from 'swr'
import { Link, useNavigate } from 'react-router-dom'
import { searchUsers, requestFriend, acceptFriend, createStreak, fetcher } from '../../lib/api'
import { toastError, toastLink } from '../../lib/toast'
import Avatar from '../../components/Avatar'

export default function FriendsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)

  const { data: friends = [], mutate: mutateFriends } = useSWR('/api/friends', fetcher)

  useEffect(() => {
    if (query.length < 3) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoadingSearch(true)
      try {
        const { data } = await searchUsers(query)
        setSearchResults(data)
      } finally {
        setLoadingSearch(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function handleAdd(id: string) {
    try {
      await requestFriend(id)
      setQuery('')
      mutateFriends()
    } catch (e) {
      toastError('Ошибка или запрос уже отправлен')
    }
  }

  async function handleAccept(id: string) {
    try {
      await acceptFriend(id)
      mutateFriends()
    } catch (e) {
      toastError('Ошибка')
    }
  }

  async function handleStartStreak(friendId: string) {
    try {
      await createStreak(friendId)
      toastLink('Серия создана! Перейти на главную', '/', navigate, '🔥')
    } catch (e) {
      toastError('Серия уже существует или ошибка')
    }
  }

  const incoming = friends.filter((f: any) => f.isIncomingRequest)
  const accepted = friends.filter((f: any) => f.status === 'ACCEPTED')
  const pendingOut = friends.filter((f: any) => f.status === 'PENDING' && !f.isIncomingRequest)

  return (
    <div className="flex flex-col px-6 pt-12 pb-6">
      <h1 className="text-3xl font-bold text-white tracking-tight mb-6">Друзья</h1>

      {/* Search */}
      <div className="relative mb-8">
        <Search
          className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--color-on-surface-variant)]"
          size={20}
        />
        <input
          type="text"
          placeholder="Найти по нику (часть ника) или QR..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-[var(--color-surface-container-high)] text-white rounded-full py-4 pl-14 pr-6 outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)] transition shadow-inner"
        />
      </div>

      {/* Search Results */}
      {query.length >= 3 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
            Результаты
          </h2>
          {loadingSearch ? (
            <p className="text-[var(--color-on-surface-variant)] text-sm">Поиск...</p>
          ) : searchResults.length === 0 ? (
            <p className="text-[var(--color-on-surface-variant)] text-sm">Ничего не найдено</p>
          ) : (
            <div className="flex flex-col gap-3">
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between glass-card p-4 rounded-3xl"
                >
                  <Link
                    to={`/${u.nickname}`}
                    onClick={() => setQuery('')}
                    className="flex items-center gap-4 min-w-0 flex-1 active:opacity-80"
                  >
                    <Avatar path={u.avatarUrl} size="sm" />
                    <span className="font-bold text-white tracking-tight truncate">
                      @{u.nickname}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleAdd(u.id)}
                    className="p-3 bg-[var(--color-brand-primary)] text-white rounded-full hover:bg-[var(--color-primary-container)] transition active:scale-95 shadow-[0_4px_15px_rgba(255,26,79,0.3)] shrink-0 ml-2"
                  >
                    <UserPlus size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incoming Requests */}
      {incoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
            Запросы ({incoming.length})
          </h2>
          <div className="flex flex-col gap-3">
            {incoming.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between glass-card p-4 rounded-3xl border border-[var(--color-brand-primary)]/20"
              >
                <div className="flex items-center gap-4">
                  <Avatar path={f.friend.avatarUrl} size="sm" />
                  <span className="font-bold text-white tracking-tight">@{f.friend.nickname}</span>
                </div>
                <button
                  onClick={() => handleAccept(f.id)}
                  className="px-5 py-2.5 bg-[var(--color-brand-primary)] text-white text-sm font-bold rounded-full hover:bg-[var(--color-primary-container)] transition active:scale-95 shadow-[0_4px_15px_rgba(255,26,79,0.3)]"
                >
                  Принять
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div>
        <h2 className="text-xs font-bold text-[var(--color-on-surface-variant)] uppercase tracking-widest mb-4">
          Мои друзья
        </h2>
        {accepted.length === 0 && pendingOut.length === 0 ? (
          <p className="text-[var(--color-on-surface-variant)] text-sm text-center py-10 opacity-70">
            У вас пока нет друзей
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {accepted.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between glass-card p-4 rounded-3xl"
              >
                <div className="flex items-center gap-4">
                  <Avatar path={f.friend.avatarUrl} size="sm" />
                  <span className="font-bold text-white tracking-tight">@{f.friend.nickname}</span>
                </div>
                <button
                  onClick={() => handleStartStreak(f.friend.id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-brand-primary)]/10 text-[var(--color-brand-primary)] text-sm font-bold rounded-full hover:bg-[var(--color-brand-primary)]/20 transition active:scale-95"
                >
                  <Flame size={18} /> Серия
                </button>
              </div>
            ))}
            {pendingOut.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between bg-transparent border border-[var(--color-surface-container-high)] p-4 rounded-3xl opacity-60"
              >
                <div className="flex items-center gap-4">
                  <Avatar path={f.friend.avatarUrl} size="sm" />
                  <span className="font-bold text-white tracking-tight">@{f.friend.nickname}</span>
                </div>
                <span className="text-xs text-[var(--color-on-surface-variant)] flex items-center gap-1.5 font-medium uppercase tracking-wider">
                  <Clock size={14} /> Ожидает
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Flame(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
    </svg>
  )
}
