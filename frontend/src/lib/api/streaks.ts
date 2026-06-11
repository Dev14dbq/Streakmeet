import type {
  MagicMeetResponse,
  RestartStreakResponse,
  RestoreStreakResponse,
  StreakDetail,
  StreakListItem,
} from '@streakmeet/api-spec'
import { migratedApi } from './migratedClient'

const streaksApi = () => migratedApi()

export const getStreaks = () => streaksApi().get<StreakListItem[]>('/api/streaks')
export const getStreak = (partnerNickname: string) =>
  streaksApi().get<StreakDetail>(
    `/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}`
  )
export const createStreak = (partnerId: string) => streaksApi().post('/api/streaks', { partnerId })
export const updateStreakPet = (streakId: string, petName: string) =>
  streaksApi().patch<{ id: string; petName: string }>(
    `/api/streaks/${encodeURIComponent(streakId)}/pet`,
    { petName }
  )
export const deleteStreak = (streakId: string) =>
  streaksApi().delete<{ ok: true }>(`/api/streaks/${encodeURIComponent(streakId)}`)
export const remindStreak = (partnerNickname: string) =>
  streaksApi().post<{ ok: true }>(
    `/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}/remind`
  )

export const restoreStreak = (partnerNickname: string) =>
  streaksApi().post<RestoreStreakResponse>(
    `/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}/restore`
  )

export const restartStreak = (partnerNickname: string) =>
  streaksApi().post<RestartStreakResponse>(
    `/api/streaks/${encodeURIComponent(partnerNickname.toLowerCase())}/restart`
  )

export const initRemoteSelfie = (streakId: string, photoBase64: string) =>
  streaksApi().post(`/api/streaks/${streakId}/remote-selfie/init`, { photoBase64 })

export const replyRemoteSelfie = (streakId: string, requestId: string, photoBase64: string) =>
  streaksApi().post<{ success: boolean; photoUrl: string }>(
    `/api/streaks/${streakId}/remote-selfie/reply/${requestId}`,
    { photoBase64 }
  )

export const magicMeet = (payload: {
  photoBase64?: string
  photosBase64?: string[]
  location?: { lat: number; lng: number }
}) => streaksApi().post<MagicMeetResponse>('/api/streaks/magic-meet', payload, { timeout: 120_000 })
