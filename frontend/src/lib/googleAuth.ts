import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'
import { isMobilePhone } from './device'
import { generatePkce } from './pkce'

function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

const GOOGLE_CLIENT_ID = readEnv('VITE_GOOGLE_CLIENT_ID')
// Empty VITE_GOOGLE_IOS_CLIENT_ID in .env must not override the web client id.
const GOOGLE_IOS_CLIENT_ID = readEnv('VITE_GOOGLE_IOS_CLIENT_ID') || GOOGLE_CLIENT_ID
const REDIRECT_PENDING_KEY = 'streakmeet_google_redirect'

export type GoogleSignInTokens = {
  accessToken?: string
  idToken?: string
  code?: string
  codeVerifier?: string
  redirectUri?: string
}

type RedirectPending = {
  nonce: string
  verifier: string
  redirectUri: string
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
  if (!GOOGLE_IOS_CLIENT_ID) throw new Error('no_client_id')
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

export async function startGoogleRedirectLogin(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error('no_client_id')

  const redirectUri = `${window.location.origin}/login`
  const { verifier, challenge } = await generatePkce()
  const nonce = crypto.randomUUID()
  const pending: RedirectPending = { nonce, verifier, redirectUri }
  sessionStorage.setItem(REDIRECT_PENDING_KEY, JSON.stringify(pending))

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function readRedirectPending(): RedirectPending | null {
  const raw = sessionStorage.getItem(REDIRECT_PENDING_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as RedirectPending
  } catch {
    return null
  }
}

function clearRedirectPendingFromUrl(): void {
  sessionStorage.removeItem(REDIRECT_PENDING_KEY)
  window.history.replaceState({}, '', window.location.pathname)
}

/** Authorization code + PKCE return (mobile browser redirect flow). */
export function consumeGoogleRedirectCode(): GoogleSignInTokens | null {
  const pending = readRedirectPending()
  if (!pending?.verifier) return null

  const params = new URLSearchParams(window.location.search)
  if (params.get('error')) {
    clearRedirectPendingFromUrl()
    return null
  }

  const code = params.get('code')
  if (!code) return null

  clearRedirectPendingFromUrl()

  return {
    code,
    codeVerifier: pending.verifier,
    redirectUri: pending.redirectUri,
  }
}

export function isGoogleAuthCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const lower = message.toLowerCase()
  return (
    lower.includes('cancel') || lower.includes('popup closed') || lower.includes('user_cancelled')
  )
}

/** GIS OAuth popup returned an error object (not user closing the window). */
export function isGoogleOAuthAccessDenied(error: { error?: string } | undefined): boolean {
  return error?.error === 'access_denied'
}

export function isGooglePopupClosedError(error: { type?: string } | undefined): boolean {
  return error?.type === 'popup_closed'
}
