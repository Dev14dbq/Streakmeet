/** First letter for avatar placeholder (nickname without @) */
export function avatarInitial(name?: string | null): string {
  const cleaned = (name ?? '').replace(/^@/, '').trim()
  if (!cleaned) return '?'
  return cleaned.charAt(0).toUpperCase()
}
