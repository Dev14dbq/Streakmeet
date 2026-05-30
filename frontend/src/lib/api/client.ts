import axios, { isAxiosError } from 'axios'
import i18n from '../../i18n'
import { invalidateAfterMutation } from '../swrInvalidation'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized: (() => void) | null = null
let sessionClearInProgress = false

export function hasAuthSession(): boolean {
  return !!localStorage.getItem('accessToken')
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  (response) => {
    invalidateAfterMutation(response.config.method, response.config.url)
    return response
  },
  (error) => {
    const status = error.response?.status
    const code = error.response?.data?.code
    if (status === 401 && code !== 'ACCOUNT_DELETED') {
      const hadSession = hasAuthSession()
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
      if (hadSession && !sessionClearInProgress) {
        sessionClearInProgress = true
        try {
          onUnauthorized?.()
        } finally {
          sessionClearInProgress = false
        }
      }
    }
    return Promise.reject(error)
  }
)

/** True when the request failed before reaching the server (offline, timeout, DNS, etc.). */
export function isNetworkError(err: unknown): boolean {
  if (!isAxiosError(err)) return false
  if (!err.response) return true
  return false
}

/** Extracts a human-readable message from API response (translated when possible) */
export function getApiErrorMessage(err: unknown, fallback?: string): string {
  const fb = fallback ?? i18n.t('errors.generic')
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; code?: string } | undefined
    if (typeof data?.code === 'string' && data.code.trim()) {
      const codeKey = `errors.${data.code}`
      if (i18n.exists(codeKey)) return i18n.t(codeKey)
    }
    if (typeof data?.error === 'string' && data.error.trim()) {
      return data.error
    }
    if (err.code === 'ECONNABORTED') return i18n.t('errors.timeout')
    if (!err.response) return i18n.t('errors.noConnection')
  }
  if (err instanceof Error && err.message) return err.message
  return fb
}

export const fetcher = (url: string) => api.get(url).then((res) => res.data)
