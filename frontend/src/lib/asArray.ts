/** Coerce unknown SWR/API payload to an array (avoids `.filter is not a function`). */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}
