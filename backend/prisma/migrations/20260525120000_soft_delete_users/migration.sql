-- Soft delete: mark accounts as deleted, keep data for 30 days
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Allow re-registration after permanent purge via partial unique indexes
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_nickname_key";

CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "users_nickname_active_key" ON "users"("nickname") WHERE "deletedAt" IS NULL;
