export function parsePagination(
  query: { page?: string | string[]; limit?: string | string[] },
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
) {
  const defaultPage = defaults.page ?? 1
  const defaultLimit = defaults.limit ?? 12
  const maxLimit = defaults.maxLimit ?? 50

  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit

  const page = Math.max(1, parseInt(String(rawPage), 10) || defaultPage)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(rawLimit), 10) || defaultLimit))

  return { page, limit }
}
