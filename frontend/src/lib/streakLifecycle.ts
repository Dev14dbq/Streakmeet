import type { StreakLifecycle } from '@streakmeet/api-spec'

export type StreakLifecycleState = StreakLifecycle | string

export function isStreakDead(lifecycle?: StreakLifecycleState | null): boolean {
  return lifecycle === 'DEAD' || lifecycle === 'DEAD_FINAL'
}

export function isStreakDeadFinal(lifecycle?: StreakLifecycleState | null): boolean {
  return lifecycle === 'DEAD_FINAL'
}

export function isStreakActive(lifecycle?: StreakLifecycleState | null): boolean {
  return !lifecycle || lifecycle === 'ACTIVE'
}
