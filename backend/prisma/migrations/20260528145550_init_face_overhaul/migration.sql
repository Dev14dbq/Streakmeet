-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StreakDayStatus" AS ENUM ('MET', 'FROZEN', 'MISSED');

-- CreateEnum
CREATE TYPE "GemReason" AS ENUM ('MEET_PROOF', 'STREAK_MILESTONE', 'AD_REWARD', 'FREEZE_SPEND', 'RESCUE_FRIEND_SPEND', 'GRACE_RESTORE_SPEND', 'ADMIN_ADJUST');

-- CreateEnum
CREATE TYPE "StreakNotificationKind" AS ENUM ('STREAK_1H', 'STREAK_30M', 'STREAK_BURNED');

-- CreateEnum
CREATE TYPE "RemoteSelfieStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LegalDocSlug" AS ENUM ('TERMS', 'PRIVACY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "qrCodeId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "gemsBalance" INTEGER NOT NULL DEFAULT 0,
    "faceEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "faceModel" TEXT,
    "faceEnrolledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "acceptedTermsVersion" INTEGER NOT NULL DEFAULT 0,
    "acceptedPrivacyVersion" INTEGER NOT NULL DEFAULT 0,
    "sharingLocation" BOOLEAN NOT NULL DEFAULT false,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastMetDate" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_days" (
    "id" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "StreakDayStatus" NOT NULL DEFAULT 'MET',

    CONSTRAINT "streak_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meet_proofs" (
    "id" TEXT NOT NULL,
    "streakDayId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "photoHash" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "livenessOk" BOOLEAN NOT NULL DEFAULT false,
    "facesDetected" INTEGER NOT NULL DEFAULT 0,
    "matchScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meet_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gem_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" "GemReason" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gem_transactions_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "remote_selfie_requests" (
    "id" TEXT NOT NULL,
    "streakId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "senderPhotoUrl" TEXT NOT NULL,
    "status" "RemoteSelfieStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remote_selfie_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_embeddings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "detScore" DOUBLE PRECISION NOT NULL,
    "yaw" DOUBLE PRECISION NOT NULL,
    "pitch" DOUBLE PRECISION NOT NULL,
    "blurVar" DOUBLE PRECISION NOT NULL,
    "faceModel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "slug" "LegalDocSlug" NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_qrCodeId_key" ON "users"("qrCodeId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_nickname_idx" ON "users"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_userAId_userBId_key" ON "friendships"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "streaks_userAId_userBId_key" ON "streaks"("userAId", "userBId");

-- CreateIndex
CREATE UNIQUE INDEX "streak_days_streakId_date_key" ON "streak_days"("streakId", "date");

-- CreateIndex
CREATE INDEX "meet_proofs_photoHash_idx" ON "meet_proofs"("photoHash");

-- CreateIndex
CREATE UNIQUE INDEX "meet_proofs_streakDayId_photoHash_key" ON "meet_proofs"("streakDayId", "photoHash");

-- CreateIndex
CREATE INDEX "streak_notification_logs_userId_localDate_idx" ON "streak_notification_logs"("userId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "streak_notification_logs_userId_streakId_kind_localDate_key" ON "streak_notification_logs"("userId", "streakId", "kind", "localDate");

-- CreateIndex
CREATE INDEX "remote_selfie_requests_receiverId_status_idx" ON "remote_selfie_requests"("receiverId", "status");

-- CreateIndex
CREATE INDEX "face_embeddings_userId_idx" ON "face_embeddings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_key" ON "legal_documents"("slug");

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_days" ADD CONSTRAINT "streak_days_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "streaks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_proofs" ADD CONSTRAINT "meet_proofs_streakDayId_fkey" FOREIGN KEY ("streakDayId") REFERENCES "streak_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meet_proofs" ADD CONSTRAINT "meet_proofs_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gem_transactions" ADD CONSTRAINT "gem_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "streaks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_embeddings" ADD CONSTRAINT "face_embeddings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
