-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('CONTACT', 'SESSION_APPLICATION');

-- CreateEnum
CREATE TYPE "SubmissionResult" AS ENUM ('ALLOWED', 'BLOCKED');

-- CreateTable
CREATE TABLE "FormSubmissionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formType" "FormType" NOT NULL,
    "ipHash" TEXT,
    "emailHash" TEXT,
    "userAgent" TEXT,
    "result" "SubmissionResult" NOT NULL,
    "reason" TEXT,

    CONSTRAINT "FormSubmissionLog_pkey" PRIMARY KEY ("id")
);
