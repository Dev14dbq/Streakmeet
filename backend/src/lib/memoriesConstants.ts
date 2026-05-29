/** Minimum MET streak days before the memories feed unlocks. */
export const MEMORIES_UNLOCK_DAYS = 7

/** Streak length milestones shown as cards in the feed. */
export const MEMORIES_MILESTONE_DAYS = [7, 14, 30, 50, 100] as const

export type MemoryMilestoneDay = (typeof MEMORIES_MILESTONE_DAYS)[number]
