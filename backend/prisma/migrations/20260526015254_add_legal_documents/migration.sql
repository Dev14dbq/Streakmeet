-- CreateEnum
CREATE TYPE "LegalDocSlug" AS ENUM ('TERMS', 'PRIVACY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acceptedPrivacyVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "acceptedTermsVersion" INTEGER NOT NULL DEFAULT 0;

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
CREATE UNIQUE INDEX "legal_documents_slug_key" ON "legal_documents"("slug");
