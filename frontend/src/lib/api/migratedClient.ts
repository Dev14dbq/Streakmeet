import axios, { type AxiosInstance } from 'axios'
import { getRustGatewayUrl, isSyncStreamEnabled } from '../connect/client'
import { invalidateAfterMutation } from '../swrInvalidation'
import { api, getNodeApiUrl, setUnauthorizedHandler, hasAuthSession } from './client'

let rustApi: AxiosInstance | null = null
let nodeApiClient: AxiosInstance | null = null

let onUnauthorized: (() => void) | null = null
let sessionClearInProgress = false

/** Paths still on Node when Rust stack is active (see backend-rust/services/api-gateway). */
const NODE_ONLY_PREFIXES: readonly string[] = []

export function isNodeOnlyApiPath(path: string): boolean {
  const p = (path.startsWith('/') ? path : `/${path}`).split('?')[0] ?? path
  if (NODE_ONLY_PREFIXES.some((prefix) => p.startsWith(prefix))) return true
  if (p.includes('/remind')) return true
  return false
}

function attachAuthInterceptors(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  client.interceptors.response.use(
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
}

export function registerMigratedApiUnauthorized(handler: () => void): void {
  onUnauthorized = handler
  setUnauthorizedHandler(handler)
}

function createRustApi(): AxiosInstance {
  const client = axios.create({
    baseURL: getRustGatewayUrl(),
    headers: { 'Content-Type': 'application/json' },
    timeout: 180_000,
  })
  attachAuthInterceptors(client)
  return client
}

function createNodeApi(): AxiosInstance {
  const client = axios.create({
    baseURL: getNodeApiUrl(),
    headers: { 'Content-Type': 'application/json' },
    timeout: 180_000,
  })
  attachAuthInterceptors(client)
  return client
}

/** Legacy Node backend (:3000 in dev). Used for legal, memories, and other unmigrated routes. */
export function nodeApi(): AxiosInstance {
  if (!nodeApiClient) nodeApiClient = createNodeApi()
  return nodeApiClient
}

/** REST client for Rust api-gateway when sync mode is on. */
export function migratedApi(): AxiosInstance {
  if (!isSyncStreamEnabled()) return api
  if (!rustApi) rustApi = createRustApi()
  return rustApi
}

/** Picks Rust or Node client from URL path when sync stream is enabled. */
export function apiClientForPath(path: string): AxiosInstance {
  if (isNodeOnlyApiPath(path)) return nodeApi()
  return migratedApi()
}

export const fetcher = (url: string) => apiClientForPath(url).get(url).then((res) => res.data)
