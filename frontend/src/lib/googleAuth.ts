import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { isMobilePhone } from './device'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? GOOGLE_CLIENT_ID
const REDIRECT_PENDING_KEY = 'streakmeet_google_redirect'

export type GoogleSignInTokens = {
  accessToken?: string
  idToken?: string
}

let initPromise: Promise<void> | null = null

/** Native app (Capacitor) — системный Google Sign-In, без popup в WebView. */
export function useNativeGoogleSignIn(): boolean {
  return Capacitor.isNativePlatform()
}

/** Мобильный браузер — полный redirect вместо popup. */
export function useGoogleRedirectFlow(): boolean {
  return isMobilePhone() && !Capacitor.isNativePlatform()
}

export function initGoogleAuth(): Promise<void> {
  if (!GOOGLE_CLIENT_ID || !useNativeGoogleSignIn()) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_CLIENT_ID,
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: GOOGLE_CLIENT_ID,
      mode: 'online',
    },
  }).then(() => undefined)

  return initPromise
}

export async function signInWithGoogleNative(): Promise<GoogleSignInTokens> {
  await initGoogleAuth()
  const response = await SocialLogin.login({
    provider: 'google',
    options: {},
  })

  if (response.result.responseType === 'offline') {
    throw new Error('offline_mode')
  }

  return {
    accessToken: response.result.accessToken?.token,
    idToken: response.result.idToken ?? undefined,
  }
}

export function startGoogleRedirectLogin(): void {
  if (!GOOGLE_CLIENT_ID) throw new Error('no_client_id')

  const redirectUri = `${window.location.origin}/login`
  const nonce = Math.random().toString(36).slice(2)
  sessionStorage.setItem(REDIRECT_PENDING_KEY, nonce)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token id_token',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    nonce,
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function consumeGoogleRedirectTokens(): GoogleSignInTokens | null {
  if (!sessionStorage.getItem(REDIRECT_PENDING_KEY)) return null

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  if (!hash) return null

  const params = new URLSearchParams(hash)
  if (params.get('error')) {
    sessionStorage.removeItem(REDIRECT_PENDING_KEY)
    window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
    return null
  }

  const accessToken = params.get('access_token') ?? undefined
  const idToken = params.get('id_token') ?? undefined
  if (!accessToken && !idToken) return null

  sessionStorage.removeItem(REDIRECT_PENDING_KEY)
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)

  return { accessToken, idToken }
}

export function isGoogleAuthCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const lower = message.toLowerCase()
  return (
    lower.includes('cancel') || lower.includes('popup closed') || lower.includes('user_cancelled')
  )
}
