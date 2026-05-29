import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWRInfinite from 'swr/infinite'
import { Clapperboard, Flame, Image as ImageIcon, Sparkles } from 'lucide-react'
import CachedImage from '../../components/CachedImage'
import Avatar from '../../components/Avatar'
import PhotoViewerModal, { type PhotoData } from '../../components/PhotoViewerModal'
import { fetcher, getApiErrorMessage, type MemoriesFeedResponse } from '../../lib/api'
import {
  dedupeFeedItems,
  groupFeedByMonth,
  memoryMeetToPhotoData,
  unlockProgress,
} from '../../lib/memoriesFeed'
import type { MemoryFeedItem, MemoryMeetItem, MemoryMilestoneItem } from '../../lib/api/memories'
import { SWR_KEYS } from '../../lib/swrKeys'
import { formatDate, formatMonthYear } from '../../i18n/format'
import { useAuth } from '../../context/AuthContext'

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return formatMonthYear(y!, m!)
}

function MilestoneCard({ item }: { item: MemoryMilestoneItem }) {
  const { t } = useTranslation()

  return (
    <div className="glass-card rounded-3xl p-4 flex items-center gap-4 border border-[var(--color-brand-primary)]/20 shadow-[0_10px_30px_rgba(255,26,79,0.12)]">
      <div className="relative shrink-0">
        <Avatar path={item.partner.avatarUrl} name={item.partner.nickname} size="lg" />
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-brand-primary)] text-white shadow-[0_4px_12px_rgba(255,26,79,0.45)]">
          <Flame size={14} fill="currentColor" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-brand-primary)]">
          {t('memories.milestoneBadge', { count: item.milestoneDays })}
        </p>
        <p className="mt-1 font-bold text-on-surface truncate">
          {t('memories.milestoneTitle', { count: item.milestoneDays })}
        </p>
        <p className="text-sm text-[var(--color-on-surface-variant)] truncate">
          {t('memories.milestoneSubtitle', { nickname: item.partner.nickname })}
        </p>
      </div>
      <Sparkles size={18} className="shrink-0 text-[var(--color-brand-primary)]/70" />
    </div>
  )
}

function MeetCard({ item, onOpen }: { item: MemoryMeetItem; onOpen: (photo: PhotoData) => void }) {
  const { user: me } = useAuth()

  return (
    <button
      type="button"
      onClick={() => me && onOpen(memoryMeetToPhotoData(item, me))}
      className="relative aspect-[3/4] w-full rounded-3xl overflow-hidden bg-[var(--color-surface-container-high)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] group text-left"
    >
      <CachedImage
        path={item.photoUrl}
        alt=""
        className="w-full h-full object-cover transition duration-500 group-active:scale-[1.02]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <p className="text-sm font-semibold text-white truncate">@{item.partner.nickname}</p>
      </div>
    </button>
  )
}

function LockedMemories({
  daysUntilUnlock,
  unlockAtDays,
}: {
  daysUntilUnlock: number
  unlockAtDays: number
}) {
  const { t } = useTranslation()
  const progress = unlockProgress(unlockAtDays, daysUntilUnlock)

  return (
    <div className="flex min-h-full flex-col px-6 pt-12 pb-8">
      <div className="mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
          {t('memories.title')}
        </p>
        <h1 className="mt-2 text-2xl font-black text-on-surface tracking-tight">
          {t('memories.lockedTitle')}
        </h1>
        <p className="mx-auto mt-3 max-w-[300px] text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
          {t('memories.lockedDescription', { total: unlockAtDays })}
        </p>
      </div>

      <div className="glass-card rounded-3xl p-8 flex flex-col items-center text-center border border-white/5">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--color-surface-container-high)] ring-4 ring-[var(--color-brand-primary)]/15">
          <Clapperboard size={40} className="text-[var(--color-brand-primary)]" />
        </div>

        <p className="text-4xl font-black tabular-nums text-[var(--color-brand-primary)]">
          {daysUntilUnlock}
        </p>
        <p className="mt-1 text-sm font-semibold text-on-surface">
          {t('memories.daysRemaining', { count: daysUntilUnlock })}
        </p>

        <div className="mt-6 w-full">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-[var(--color-on-surface-variant)]">
            <span>
              {t('memories.progressLabel', {
                current: unlockAtDays - daysUntilUnlock,
                total: unlockAtDays,
              })}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-brand-primary)] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <Link to="/" className="btn btn--primary btn--lg mt-8 w-full">
        {t('home.todayMeet')}
      </Link>
    </div>
  )
}

export default function MemoriesPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoData | null>(null)

  const getKey = (pageIndex: number, previousPageData: MemoriesFeedResponse | null) => {
    if (previousPageData && !previousPageData.unlocked) return null
    if (previousPageData && !previousPageData.hasMore) return null
    return SWR_KEYS.memoriesPage(pageIndex + 1)
  }

  const { data, size, setSize, error, isLoading, mutate } = useSWRInfinite<MemoriesFeedResponse>(
    getKey,
    fetcher
  )

  const firstPage = data?.[0]
  const unlocked = firstPage?.unlocked ?? false
  const daysUntilUnlock = firstPage?.daysUntilUnlock ?? 7
  const unlockAtDays = firstPage?.unlockAtDays ?? 7
  const isReachingEnd = data && !data[data.length - 1]?.hasMore

  const feedItems = useMemo(
    () => dedupeFeedItems(data ? data.flatMap((page) => page.items) : []),
    [data]
  )

  const groupedByMonth = useMemo(() => groupFeedByMonth(feedItems), [feedItems])

  if (!me) return null

  if (isLoading && !firstPage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6">
        <p className="text-sm text-[var(--color-on-surface-variant)]">{t('common.loading')}</p>
      </div>
    )
  }

  if (error && !firstPage) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-[var(--color-on-surface-variant)]">
          {getApiErrorMessage(error, t('memories.loadFailed'))}
        </p>
        <button type="button" onClick={() => void mutate()} className="btn btn--secondary">
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (!unlocked) {
    return <LockedMemories daysUntilUnlock={daysUntilUnlock} unlockAtDays={unlockAtDays} />
  }

  return (
    <div className="flex min-h-full flex-col px-6 pt-12 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)]">
          {t('memories.title')}
        </p>
        <h1 className="mt-2 text-2xl font-black text-on-surface tracking-tight">
          {t('memories.unlockedTitle')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-on-surface-variant)]">
          {t('memories.unlockedSubtitle')}
        </p>
      </header>

      {feedItems.length === 0 ? (
        <div className="glass-card rounded-3xl p-10 flex flex-col items-center text-center border border-white/5">
          <ImageIcon size={36} className="mb-4 text-[var(--color-on-surface-variant)] opacity-40" />
          <p className="font-semibold text-on-surface">{t('memories.emptyFeed')}</p>
          <Link to="/" className="btn btn--secondary btn--lg mt-6">
            {t('home.todayMeet')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groupedByMonth.map(([key, days]) => (
            <section key={key}>
              <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-on-surface-variant)] capitalize">
                {monthLabel(key)}
              </p>
              <div className="flex flex-col gap-6">
                {days.map(([date, dayItems]) => (
                  <FeedDayGroup
                    key={date}
                    date={date}
                    items={dayItems}
                    onOpenPhoto={setSelectedPhoto}
                  />
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
              {t('memories.loadMore')}
            </button>
          )}
        </div>
      )}

      {selectedPhoto && (
        <PhotoViewerModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  )
}

function FeedDayGroup({
  date,
  items,
  onOpenPhoto,
}: {
  date: string
  items: MemoryFeedItem[]
  onOpenPhoto: (photo: PhotoData) => void
}) {
  const milestones = items.filter((item): item is MemoryMilestoneItem => item.kind === 'milestone')
  const meets = items.filter((item): item is MemoryMeetItem => item.kind === 'meet')
  const dateLabel = formatDate(date + 'T12:00:00', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div>
      <p className="mb-3 text-sm font-semibold capitalize text-on-surface/80">{dateLabel}</p>
      {milestones.length > 0 && (
        <div className="mb-3 flex flex-col gap-3">
          {milestones.map((item) => (
            <MilestoneCard key={item.id} item={item} />
          ))}
        </div>
      )}
      {meets.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {meets.map((item) => (
            <MeetCard key={item.id} item={item} onOpen={onOpenPhoto} />
          ))}
        </div>
      )}
    </div>
  )
}
