import axios, { type AxiosInstance } from 'axios'
import { api } from './client'
import { getRustGatewayUrl, isSyncStreamEnabled } from '../connect/client'

let rustApi: AxiosInstance | null = null

function createRustApi(): AxiosInstance {
  const client = axios.create({
    baseURL: getRustGatewayUrl(),
    headers: { 'Content-Type': 'application/json' },
    timeout: 180_000,
  })
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })
  return client
}

/** REST client for endpoints implemented on Rust api-gateway when sync mode is on. */
export function migratedApi(): AxiosInstance {
  if (!isSyncStreamEnabled()) return api
  if (!rustApi) rustApi = createRustApi()
  return rustApi
}
