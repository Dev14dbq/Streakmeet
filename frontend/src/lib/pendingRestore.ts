export type PendingRestore =
  | { kind: 'email'; email: string; password: string; daysRemaining: number }
  | {
      kind: 'google'
      accessToken?: string
      idToken?: string
      email?: string
      daysRemaining: number
    }
  | { kind: 'apple'; idToken: string; daysRemaining: number }

let pending: PendingRestore | null = null

export function setPendingRestore(data: PendingRestore): void {
  pending = data
}

export function takePendingRestore(): PendingRestore | null {
  const value = pending
  pending = null
  return value
}
