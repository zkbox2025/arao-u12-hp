-- CreateEnum
CREATE TYPE "LoginSubmissionResult" AS ENUM ('SUCCESS', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "LoginSubmissionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "emailHash" TEXT,
    "userAgent" TEXT,
    "result" "LoginSubmissionResult" NOT NULL,
    "reason" TEXT,

    CONSTRAINT "LoginSubmissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginSubmissionLog_ipHash_createdAt_idx" ON "LoginSubmissionLog"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginSubmissionLog_emailHash_createdAt_idx" ON "LoginSubmissionLog"("emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginSubmissionLog_emailHash_result_createdAt_idx" ON "LoginSubmissionLog"("emailHash", "result", "createdAt");
