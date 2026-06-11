import axios, { type AxiosInstance } from 'axios'
import { clearSession, getAccessToken, hasAuthSession } from '../authStorage'
import { getRustGatewayUrl, isSyncStreamEnabled } from '../connect/client'
import { invalidateAfterMutation } from '../swrInvalidation'
import { api, getNodeApiUrl, setUnauthorizedHandler } from './client'

let rustApi: AxiosInstance | null = null
let nodeApiClient: AxiosInstance | null = null

let onUnauthorized: (() => void) | null = null
let sessionClearInProgress = false

/** Paths still on Node when Rust stack is active — empty after full cutover. */
const NODE_ONLY_PREFIXES: readonly string[] = []

export function isNodeOnlyApiPath(path: string): boolean {
  const p = (path.startsWith('/') ? path : `/${path}`).split('?')[0] ?? path
  return NODE_ONLY_PREFIXES.some((prefix) => p.startsWith(prefix))
}

function attachAuthInterceptors(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    const token = getAccessToken()
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
        clearSession()
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

const LIST_PATHS = new Set(['/api/friends', '/api/streaks', '/api/location/friends'])

function normalizeFetcherPath(url: string): string {
  const path = (url.startsWith('/') ? url : `/${url}`).split('?')[0] ?? url
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

function expectsArrayResponse(url: string): boolean {
  return LIST_PATHS.has(normalizeFetcherPath(url))
}

/** Thrown when the server responded but list payload is not an array (misconfigured API URL, etc.). */
function rejectBadListResponse(): never {
  throw new axios.AxiosError(
    'Invalid list response',
    axios.AxiosError.ERR_NETWORK,
    undefined,
    undefined,
    undefined
  )
}

export const fetcher = (url: string) =>
  apiClientForPath(url)
    .get(url)
    .then((res) => {
      const data = res.data
      if (expectsArrayResponse(url) && !Array.isArray(data)) {
        rejectBadListResponse()
      }
      return data
    })
