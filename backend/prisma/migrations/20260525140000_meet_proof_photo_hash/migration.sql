-- Photo uniqueness per streak day
ALTER TABLE "meet_proofs" ADD COLUMN "photoHash" TEXT;

UPDATE "meet_proofs" SET "photoHash" = "id" WHERE "photoHash" IS NULL;

ALTER TABLE "meet_proofs" ALTER COLUMN "photoHash" SET NOT NULL;

CREATE INDEX "meet_proofs_photoHash_idx" ON "meet_proofs"("photoHash");

CREATE UNIQUE INDEX "meet_proofs_streakDayId_photoHash_key" ON "meet_proofs"("streakDayId", "photoHash");
