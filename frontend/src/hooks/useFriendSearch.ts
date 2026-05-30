import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import {
  searchUsers,
  requestFriend,
  acceptFriend,
  createStreak,
  fetcher,
  getApiErrorMessage,
} from '../lib/api'
import { SWR_KEYS } from '../lib/swrKeys'
import { toastError, toastLink } from '../lib/toast'
import type { FriendListItem, AuthUser } from '@streakmeet/api-spec'

export interface FriendPartition {
  incoming: FriendListItem[]
  accepted: FriendListItem[]
  pendingOut: FriendListItem[]
}

export function partitionFriends(friends: FriendListItem[]): FriendPartition {
  return {
    incoming: friends.filter((f) => f.isIncomingRequest),
    accepted: friends.filter((f) => f.status === 'ACCEPTED'),
    pendingOut: friends.filter((f) => f.status === 'PENDING' && !f.isIncomingRequest),
  }
}

export function useFriendSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AuthUser[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)

  const { data: friends = [], mutate: mutateFriends } = useSWR<FriendListItem[]>(
    SWR_KEYS.friends,
    fetcher
  )

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

  async function handleAdd(userId: string) {
    try {
      await requestFriend(userId)
      setQuery('')
      void mutateFriends()
    } catch (e) {
      toastError(getApiErrorMessage(e, t('friends.requestOrError')))
    }
  }

  async function handleAccept(friendshipId: string) {
    try {
      await acceptFriend(friendshipId)
      void mutateFriends()
    } catch (e) {
      toastError(getApiErrorMessage(e, t('errors.generic')))
    }
  }

  async function handleStartStreak(partnerId: string) {
    try {
      await createStreak(partnerId)
      toastLink(t('friends.streakCreated'), '/', navigate, '🔥')
    } catch (e) {
      toastError(getApiErrorMessage(e, t('friends.streakExistsOrError')))
    }
  }

  const partition = partitionFriends(friends)

  return {
    query,
    setQuery,
    searchResults,
    loadingSearch,
    friends,
    mutateFriends,
    partition,
    handleAdd,
    handleAccept,
    handleStartStreak,
  }
}
