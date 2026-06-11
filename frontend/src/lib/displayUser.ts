/** Trim nickname and strip a leading @. Returns null when missing. */
export function normalizeNickname(nickname?: string | null): string | null {
  const cleaned = (nickname ?? '').replace(/^@/, '').trim()
  return cleaned || null
}

/** @nickname for display, or a human-readable fallback when data is unavailable. */
export function formatNickname(nickname?: string | null, unknownLabel = 'Unknown'): string {
  const cleaned = normalizeNickname(nickname)
  return cleaned ? `@${cleaned}` : unknownLabel
}
