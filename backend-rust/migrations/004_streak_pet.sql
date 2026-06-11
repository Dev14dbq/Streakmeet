-- Adds Seriychik metadata to each active streak.
ALTER TABLE streaks
  ADD COLUMN IF NOT EXISTS "petName" TEXT NOT NULL DEFAULT 'Серийчик',
  ADD COLUMN IF NOT EXISTS "petPoints" INTEGER NOT NULL DEFAULT 0;

UPDATE streaks
SET "petName" = 'Серийчик'
WHERE "petName" IS NULL OR BTRIM("petName") = '';

UPDATE streaks
SET "petPoints" = 0
WHERE "petPoints" IS NULL OR "petPoints" < 0;
