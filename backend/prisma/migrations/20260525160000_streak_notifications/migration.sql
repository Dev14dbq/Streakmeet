-- CreateEnum
CREATE TYPE "StreakNotificationKind" AS ENUM ('STREAK_1H', 'STREAK_30M', 'STREAK_BURNED');

-- CreateTable
CREATE TABLE "streak_notification_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "kind" "StreakNotificationKind" NOT NULL,
    "localDate" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "streak_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streak_notification_logs_userId_streakId_kind_localDate_key" ON "streak_notification_logs"("userId", "streakId", "kind", "localDate");

-- CreateIndex
CREATE INDEX "streak_notification_logs_userId_localDate_idx" ON "streak_notification_logs"("userId", "localDate");
