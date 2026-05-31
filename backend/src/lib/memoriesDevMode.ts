/** Temporary flag: MEMORIES_DEV_MODE=true serves placeholder feed data for UI testing. */
export function isMemoriesDevMode(): boolean {
  return process.env.MEMORIES_DEV_MODE === 'true'
}
