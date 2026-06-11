import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { AuthUser } from './api'

const TOKEN_KEY = 'accessToken'
const USER_KEY = 'user'

let tokenCache: string | null = null
let userCache: AuthUser | null = null
let hydrated = false

function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

async function nativeGet(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key })
  return value
}

async function nativeSet(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value })
}

async function nativeRemove(key: string): Promise<void> {
  await Preferences.remove({ key })
}

async function migrateFromLocalStorage(): Promise<void> {
  const legacyToken = localStorage.getItem(TOKEN_KEY)
  const legacyUser = localStorage.getItem(USER_KEY)
  if (legacyToken) {
    await nativeSet(TOKEN_KEY, legacyToken)
    localStorage.removeItem(TOKEN_KEY)
  }
  if (legacyUser) {
    await nativeSet(USER_KEY, legacyUser)
    localStorage.removeItem(USER_KEY)
  }
}

function parseUser(json: string | null): AuthUser | null {
  if (!json) return null
  try {
    return JSON.parse(json) as AuthUser
  } catch {
    return null
  }
}

/** Load session from persistent storage into memory (call once before app mount). */
export async function hydrateAuthStorage(): Promise<void> {
  if (hydrated) return

  if (isNative()) {
    await migrateFromLocalStorage()
    tokenCache = await nativeGet(TOKEN_KEY)
    userCache = parseUser(await nativeGet(USER_KEY))
  } else {
    tokenCache = localStorage.getItem(TOKEN_KEY)
    userCache = parseUser(localStorage.getItem(USER_KEY))
  }

  hydrated = true
}

export function getAccessToken(): string | null {
  return tokenCache
}

export function hasAuthSession(): boolean {
  return !!tokenCache
}

export function getStoredUser(): AuthUser | null {
  return userCache
}

async function persistToken(token: string | null): Promise<void> {
  if (isNative()) {
    if (token) await nativeSet(TOKEN_KEY, token)
    else await nativeRemove(TOKEN_KEY)
    return
  }
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function persistUser(user: AuthUser | null): Promise<void> {
  const json = user ? JSON.stringify(user) : null
  if (isNative()) {
    if (json) await nativeSet(USER_KEY, json)
    else await nativeRemove(USER_KEY)
    return
  }
  if (json) localStorage.setItem(USER_KEY, json)
  else localStorage.removeItem(USER_KEY)
}

export function setSession(token: string, user: AuthUser): void {
  tokenCache = token
  userCache = user
  void persistToken(token)
  void persistUser(user)
}

export function setStoredUser(user: AuthUser): void {
  userCache = user
  void persistUser(user)
}

export function clearSession(): void {
  tokenCache = null
  userCache = null
  void persistToken(null)
  void persistUser(null)
}
