import { useEffect, useState, useSyncExternalStore } from 'react'

export const THEME_STORAGE_KEY = 'streakmeet_theme'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_CHANGED = 'streakmeet-theme-changed'

let systemMq: MediaQueryList | null = null

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function getThemePreference(): ThemePreference {
  return readPreference()
}

export function getResolvedTheme(pref: ThemePreference = readPreference()): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

function notifyThemeListeners() {
  window.dispatchEvent(new Event(THEME_CHANGED))
}

function ensureSystemListener() {
  if (systemMq || typeof window === 'undefined') return
  systemMq = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (readPreference() === 'system') {
      applyTheme('system')
    }
  }
  systemMq.addEventListener('change', onChange)
}

export function applyTheme(pref: ThemePreference = readPreference()) {
  if (typeof document === 'undefined') return getResolvedTheme(pref)
  const resolved = getResolvedTheme(pref)
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  return resolved
}

export function setThemePreference(pref: ThemePreference) {
  localStorage.setItem(THEME_STORAGE_KEY, pref)
  applyTheme(pref)
  notifyThemeListeners()
}

export function initTheme() {
  applyTheme()
  ensureSystemListener()
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY) applyTheme()
  })
}

function subscribeResolvedTheme(onStoreChange: () => void) {
  const handler = () => onStoreChange()
  window.addEventListener(THEME_CHANGED, handler)
  return () => window.removeEventListener(THEME_CHANGED, handler)
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeResolvedTheme,
    () => getResolvedTheme(),
    () => 'dark'
  )
}

export function useThemePreference(): ThemePreference {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference())
  useEffect(() => {
    return subscribeResolvedTheme(() => setPref(getThemePreference()))
  }, [])
  return pref
}

export const MAP_TILE_URLS: Record<ResolvedTheme, string> = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
}
