export function routeParam(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] : value)
}
