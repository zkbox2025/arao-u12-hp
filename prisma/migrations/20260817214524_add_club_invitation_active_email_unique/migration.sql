-- CreateEnum
CREATE TYPE "StorageDeletionSourceType" AS ENUM ('EVENT_ATTACHMENT', 'NOTICE_ATTACHMENT');

-- CreateEnum
CREATE TYPE "StorageDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "LineDeliveryStatus" ADD VALUE 'PROCESSING';

-- CreateTable
CREATE TABLE "StorageDeletionJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sourceType" "StorageDeletionSourceType" NOT NULL,
    "status" "StorageDeletionStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "StorageDeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageDeletionJob_claimToken_key" ON "StorageDeletionJob"("claimToken");

-- CreateIndex
CREATE INDEX "StorageDeletionJob_clubId_status_idx" ON "StorageDeletionJob"("clubId", "status");

-- CreateIndex
CREATE INDEX "StorageDeletionJob_status_nextAttemptAt_idx" ON "StorageDeletionJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "StorageDeletionJob_status_leaseExpiresAt_idx" ON "StorageDeletionJob"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorageDeletionJob_bucket_storagePath_key" ON "StorageDeletionJob"("bucket", "storagePath");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_status_leaseExpiresAt_idx" ON "ClubLineDelivery"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "StorageDeletionJob" ADD CONSTRAINT "StorageDeletionJob_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ClubInvitation_active_email_key"
ON "ClubInvitation" (
  "clubId",
  LOWER("email")
)
WHERE "status" IN (
  'PREPARING',
  'READY_TO_SEND',
  'SENT',
  'EMAIL_FAILED'
);