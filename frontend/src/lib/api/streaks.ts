import type { MagicMeetResponse, StreakDetail, StreakListItem } from '@streakmeet/api-spec'
import { api } from './client'
import { isSyncStreamEnabled } from '../connect/client'
import { migratedApi } from './migratedClient'

const streaksApi = () => migratedApi()

export const getStreaks = () => streaksApi().get<StreakListItem[]>('/api/streaks')
export const getStreak = (partnerNickname: string) =>
  streaksApi().get<StreakDetail>(
    `/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}`
  )
export const createStreak = (partnerId: string) => streaksApi().post('/api/streaks', { partnerId })
export const remindStreak = (partnerNickname: string) =>
  api.post<{ ok: true }>(`/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}/remind`)

export const initRemoteSelfie = (streakId: string, photoBase64: string) =>
  api.post(`/api/streaks/${streakId}/remote-selfie/init`, { photoBase64 })

export const replyRemoteSelfie = (streakId: string, requestId: string, photoBase64: string) =>
  api.post<{ success: boolean; photoUrl: string }>(
    `/api/streaks/${streakId}/remote-selfie/reply/${requestId}`,
    { photoBase64 }
  )

export const magicMeet = (payload: {
  photoBase64?: string
  photosBase64?: string[]
  location?: { lat: number; lng: number }
}) => {
  const client = isSyncStreamEnabled() ? streaksApi() : api
  return client.post<MagicMeetResponse>('/api/streaks/magic-meet', payload, { timeout: 120_000 })
}
