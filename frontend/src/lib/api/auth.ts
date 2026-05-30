import type {
  AuthResponse,
  DeletedAccountInfo,
  RegisterPayload,
  RestoreAccountPayload,
} from '@streakmeet/api-spec'
import { getDeviceTimezone } from '../timezone'
import { migratedApi } from './migratedClient'

const authApi = () => migratedApi()

export const checkEmail = (email: string) =>
  authApi().post<{ exists: boolean }>('/api/auth/check-email', { email })

export const login = (email: string, password: string) =>
  authApi().post<AuthResponse>('/api/auth/login', {
    email,
    password,
    timezone: getDeviceTimezone(),
  })

export const restoreAccount = (payload: RestoreAccountPayload) =>
  authApi().post<AuthResponse>('/api/auth/restore-account', payload)

export const register = (data: RegisterPayload) =>
  authApi().post<AuthResponse>('/api/auth/register', data)

export const resendVerificationEmail = () =>
  authApi().post<{ success: true }>('/api/auth/resend-verification')

export const confirmEmailVerification = (token: string) =>
  authApi().post<{ success: true }>('/api/auth/verify-email', { token })

export const forgotPassword = (email: string) =>
  authApi().post<{ success: true }>('/api/auth/forgot-password', { email })

export const resetPassword = (token: string, password: string) =>
  authApi().post<{ success: true }>('/api/auth/reset-password', { token, password })

export const enrollFace = (photos: string[]) =>
  authApi().post('/api/auth/enroll-face', { photos }, { timeout: 120_000 })

export function getDeletedAccountInfo(err: unknown): DeletedAccountInfo | null {
  const data = (err as { response?: { status?: number; data?: DeletedAccountInfo } })?.response
  if ((data?.status === 403 || data?.status === 409) && data.data?.code === 'ACCOUNT_DELETED') {
    return data.data
  }
  return null
}
