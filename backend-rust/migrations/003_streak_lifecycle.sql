-- Streak death / ad-restore lifecycle (run once: psql "$DATABASE_URL" -f backend-rust/migrations/003_streak_lifecycle.sql)

DO $$ BEGIN
  CREATE TYPE "StreakLifecycle" AS ENUM ('ACTIVE', 'DEAD', 'DEAD_FINAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE streaks
  ADD COLUMN IF NOT EXISTS lifecycle "StreakLifecycle" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "countAtDeath" INTEGER,
  ADD COLUMN IF NOT EXISTS "restoresMonthKey" TEXT,
  ADD COLUMN IF NOT EXISTS "restoresUsedMonth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "diedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS streak_restores (
  id TEXT PRIMARY KEY,
  "streakId" TEXT NOT NULL REFERENCES streaks(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS streak_restores_streak_month_idx
  ON streak_restores ("streakId", "createdAt");
