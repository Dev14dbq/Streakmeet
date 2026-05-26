-- CreateEnum
CREATE TYPE "RemoteSelfieStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');

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

-- CreateIndex
CREATE INDEX "remote_selfie_requests_receiverId_status_idx" ON "remote_selfie_requests"("receiverId", "status");

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_streakId_fkey" FOREIGN KEY ("streakId") REFERENCES "streaks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_selfie_requests" ADD CONSTRAINT "remote_selfie_requests_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
