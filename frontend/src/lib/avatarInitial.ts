import { normalizeNickname } from './displayUser'

/** First letter for avatar placeholder (nickname without @). Null when name is unavailable. */
export function avatarInitial(name?: string | null): string | null {
  const cleaned = normalizeNickname(name)
  return cleaned ? cleaned.charAt(0).toUpperCase() : null
}
