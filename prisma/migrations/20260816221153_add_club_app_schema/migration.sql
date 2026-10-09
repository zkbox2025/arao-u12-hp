-- CreateEnum
CREATE TYPE "ClubMemberRole" AS ENUM ('OWNER', 'COACH', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClubMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('STARTER', 'STANDARD', 'PRO');

-- CreateEnum
CREATE TYPE "ClubEventGenre" AS ENUM ('PRACTICE', 'PRACTICE_GAME', 'TOURNAMENT', 'CAMP', 'HOLIDAY', 'OTHER');

-- CreateEnum
CREATE TYPE "ClubNoticeGenre" AS ENUM ('IMPORTANT', 'SCHEDULE', 'EVENT', 'ACCOUNTING', 'GENERAL');

-- CreateEnum
CREATE TYPE "LineDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportReportCategory" AS ENUM ('BUG', 'QUESTION', 'REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('DEVELOPER', 'SUPPORT');

-- CreateEnum
CREATE TYPE "LineDeliveryContentType" AS ENUM ('EVENT', 'NOTICE');

-- CreateEnum
CREATE TYPE "ClubInvitationStatus" AS ENUM ('PREPARING', 'READY_TO_SEND', 'SENT', 'EMAIL_FAILED', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "domain" TEXT,
    "planType" "PlanType" NOT NULL DEFAULT 'STARTER',
    "appBaseUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "name" TEXT,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" "Grade",

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubMembership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClubMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "ClubMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "canManageWebsite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildClubMembership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "status" "ClubMembershipStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "ChildClubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubInvitation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "ClubMemberRole" NOT NULL,
    "status" "ClubInvitationStatus" NOT NULL DEFAULT 'PREPARING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "membershipId" TEXT,
    "authUserId" TEXT,
    "invitedByMembershipId" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "emailSendError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "ClubInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "targetRoles" "ClubMemberRole"[],
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "meetingAt" TIMESTAMP(3),
    "meetingLocation" TEXT,
    "belongings" TEXT,
    "notes" TEXT,
    "clubId" TEXT NOT NULL,
    "createdByMembershipId" TEXT,
    "updatedByMembershipId" TEXT,
    "genre" "ClubEventGenre" NOT NULL DEFAULT 'PRACTICE',
    "firstPublishedAt" TIMESTAMP(3),
    "readRequiredAt" TIMESTAMP(3),

    CONSTRAINT "ClubEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEventMemo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,

    CONSTRAINT "ClubEventMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubNotice" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetRoles" "ClubMemberRole"[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "genre" "ClubNoticeGenre" NOT NULL DEFAULT 'GENERAL',
    "createdByMembershipId" TEXT,
    "updatedByMembershipId" TEXT,
    "firstPublishedAt" TIMESTAMP(3),
    "readRequiredAt" TIMESTAMP(3),
    "clubId" TEXT NOT NULL,

    CONSTRAINT "ClubNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEventAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClubEventAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubNoticeAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClubNoticeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEventRead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubEventRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubNoticeRead" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubNoticeRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubLineSetting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "lineChannelId" TEXT,
    "lineBotUserId" TEXT,
    "lineChannelAccessTokenEncrypted" TEXT,
    "lineChannelSecretEncrypted" TEXT,
    "webhookKey" TEXT NOT NULL,
    "adminLiffId" TEXT,
    "adminLiffUrl" TEXT,
    "operationLiffId" TEXT,
    "operationLiffUrl" TEXT,

    CONSTRAINT "ClubLineSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubLineTarget" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "lineSettingId" TEXT NOT NULL,
    "targetName" TEXT,
    "lineGroupId" TEXT NOT NULL,
    "targetRoles" "ClubMemberRole"[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ClubLineTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubLineRegistrationToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "lineSettingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT NOT NULL,

    CONSTRAINT "ClubLineRegistrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEmailSetting" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "notificationEmail" TEXT,
    "fromName" TEXT,
    "replyToEmail" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ClubEmailSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "membershipId" TEXT,
    "category" "SupportReportCategory" NOT NULL DEFAULT 'BUG',
    "status" "SupportReportStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "reporterName" TEXT,
    "reporterEmail" TEXT,
    "reporterRole" "ClubMemberRole",
    "handledByPlatformAdminId" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "internalNote" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyError" TEXT,

    CONSTRAINT "SupportReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubLineDelivery" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "eventId" TEXT,
    "noticeId" TEXT,
    "contentType" "LineDeliveryContentType" NOT NULL,
    "contentTitle" TEXT NOT NULL,
    "messageSnapshot" TEXT,
    "targetNameSnapshot" TEXT,
    "requestedByMembershipId" TEXT,
    "status" "LineDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "ClubLineDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'DEVELOPER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Club_domain_key" ON "Club"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "Child_parentId_idx" ON "Child"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Child_id_parentId_key" ON "Child"("id", "parentId");

-- CreateIndex
CREATE INDEX "ClubMembership_userId_status_idx" ON "ClubMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_role_idx" ON "ClubMembership"("clubId", "role");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_status_idx" ON "ClubMembership"("clubId", "status");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_status_canManageWebsite_idx" ON "ClubMembership"("clubId", "status", "canManageWebsite");

-- CreateIndex
CREATE INDEX "ClubMembership_clubId_role_status_idx" ON "ClubMembership"("clubId", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembership_id_clubId_key" ON "ClubMembership"("id", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMembership_clubId_userId_key" ON "ClubMembership"("clubId", "userId");

-- CreateIndex
CREATE INDEX "ChildClubMembership_childId_status_idx" ON "ChildClubMembership"("childId", "status");

-- CreateIndex
CREATE INDEX "ChildClubMembership_clubId_status_idx" ON "ChildClubMembership"("clubId", "status");

-- CreateIndex
CREATE INDEX "ChildClubMembership_parentUserId_idx" ON "ChildClubMembership"("parentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildClubMembership_clubId_childId_key" ON "ChildClubMembership"("clubId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubInvitation_tokenHash_key" ON "ClubInvitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClubInvitation_membershipId_key" ON "ClubInvitation"("membershipId");

-- CreateIndex
CREATE INDEX "ClubInvitation_clubId_email_idx" ON "ClubInvitation"("clubId", "email");

-- CreateIndex
CREATE INDEX "ClubInvitation_expiresAt_idx" ON "ClubInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "ClubInvitation_acceptedAt_idx" ON "ClubInvitation"("acceptedAt");

-- CreateIndex
CREATE INDEX "ClubEvent_clubId_status_startAt_idx" ON "ClubEvent"("clubId", "status", "startAt");

-- CreateIndex
CREATE INDEX "ClubEvent_clubId_status_endAt_idx" ON "ClubEvent"("clubId", "status", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEvent_id_clubId_key" ON "ClubEvent"("id", "clubId");

-- CreateIndex
CREATE INDEX "ClubEventMemo_clubId_eventId_idx" ON "ClubEventMemo"("clubId", "eventId");

-- CreateIndex
CREATE INDEX "ClubEventMemo_clubId_membershipId_idx" ON "ClubEventMemo"("clubId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventMemo_clubId_eventId_membershipId_key" ON "ClubEventMemo"("clubId", "eventId", "membershipId");

-- CreateIndex
CREATE INDEX "ClubNotice_clubId_status_createdAt_idx" ON "ClubNotice"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClubNotice_clubId_status_isPinned_updatedAt_idx" ON "ClubNotice"("clubId", "status", "isPinned", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNotice_id_clubId_key" ON "ClubNotice"("id", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventAttachment_storagePath_key" ON "ClubEventAttachment"("storagePath");

-- CreateIndex
CREATE INDEX "ClubEventAttachment_clubId_eventId_idx" ON "ClubEventAttachment"("clubId", "eventId");

-- CreateIndex
CREATE INDEX "ClubEventAttachment_clubId_eventId_displayOrder_idx" ON "ClubEventAttachment"("clubId", "eventId", "displayOrder");

-- CreateIndex
CREATE INDEX "ClubEventAttachment_eventId_idx" ON "ClubEventAttachment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNoticeAttachment_storagePath_key" ON "ClubNoticeAttachment"("storagePath");

-- CreateIndex
CREATE INDEX "ClubNoticeAttachment_clubId_noticeId_idx" ON "ClubNoticeAttachment"("clubId", "noticeId");

-- CreateIndex
CREATE INDEX "ClubNoticeAttachment_clubId_noticeId_displayOrder_idx" ON "ClubNoticeAttachment"("clubId", "noticeId", "displayOrder");

-- CreateIndex
CREATE INDEX "ClubNoticeAttachment_noticeId_idx" ON "ClubNoticeAttachment"("noticeId");

-- CreateIndex
CREATE INDEX "ClubEventRead_clubId_membershipId_readAt_idx" ON "ClubEventRead"("clubId", "membershipId", "readAt");

-- CreateIndex
CREATE INDEX "ClubEventRead_clubId_eventId_idx" ON "ClubEventRead"("clubId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventRead_clubId_eventId_membershipId_key" ON "ClubEventRead"("clubId", "eventId", "membershipId");

-- CreateIndex
CREATE INDEX "ClubNoticeRead_clubId_membershipId_readAt_idx" ON "ClubNoticeRead"("clubId", "membershipId", "readAt");

-- CreateIndex
CREATE INDEX "ClubNoticeRead_clubId_noticeId_idx" ON "ClubNoticeRead"("clubId", "noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubNoticeRead_clubId_noticeId_membershipId_key" ON "ClubNoticeRead"("clubId", "noticeId", "membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineSetting_clubId_key" ON "ClubLineSetting"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineSetting_webhookKey_key" ON "ClubLineSetting"("webhookKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineSetting_id_clubId_key" ON "ClubLineSetting"("id", "clubId");

-- CreateIndex
CREATE INDEX "ClubLineTarget_clubId_isEnabled_idx" ON "ClubLineTarget"("clubId", "isEnabled");

-- CreateIndex
CREATE INDEX "ClubLineTarget_clubId_idx" ON "ClubLineTarget"("clubId");

-- CreateIndex
CREATE INDEX "ClubLineTarget_lineSettingId_isEnabled_idx" ON "ClubLineTarget"("lineSettingId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineTarget_id_clubId_key" ON "ClubLineTarget"("id", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineTarget_lineSettingId_lineGroupId_key" ON "ClubLineTarget"("lineSettingId", "lineGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineRegistrationToken_tokenHash_key" ON "ClubLineRegistrationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClubLineRegistrationToken_clubId_expiresAt_idx" ON "ClubLineRegistrationToken"("clubId", "expiresAt");

-- CreateIndex
CREATE INDEX "ClubLineRegistrationToken_clubId_usedAt_idx" ON "ClubLineRegistrationToken"("clubId", "usedAt");

-- CreateIndex
CREATE INDEX "ClubLineRegistrationToken_lineSettingId_expiresAt_idx" ON "ClubLineRegistrationToken"("lineSettingId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEmailSetting_clubId_key" ON "ClubEmailSetting"("clubId");

-- CreateIndex
CREATE INDEX "SupportReport_clubId_status_createdAt_idx" ON "SupportReport"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportReport_clubId_membershipId_createdAt_idx" ON "SupportReport"("clubId", "membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportReport_status_createdAt_idx" ON "SupportReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineDelivery_idempotencyKey_key" ON "ClubLineDelivery"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClubLineDelivery_claimToken_key" ON "ClubLineDelivery"("claimToken");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_requestedAt_idx" ON "ClubLineDelivery"("clubId", "requestedAt");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_requestId_idx" ON "ClubLineDelivery"("clubId", "requestId");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_targetId_status_idx" ON "ClubLineDelivery"("clubId", "targetId", "status");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_eventId_status_idx" ON "ClubLineDelivery"("clubId", "eventId", "status");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_noticeId_status_idx" ON "ClubLineDelivery"("clubId", "noticeId", "status");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_status_nextAttemptAt_idx" ON "ClubLineDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ClubLineDelivery_clubId_status_nextAttemptAt_idx" ON "ClubLineDelivery"("clubId", "status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE INDEX "PlatformAdmin_role_isActive_idx" ON "PlatformAdmin"("role", "isActive");

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubMembership" ADD CONSTRAINT "ClubMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildClubMembership" ADD CONSTRAINT "ChildClubMembership_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildClubMembership" ADD CONSTRAINT "ChildClubMembership_childId_parentUserId_fkey" FOREIGN KEY ("childId", "parentUserId") REFERENCES "Child"("id", "parentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildClubMembership" ADD CONSTRAINT "ChildClubMembership_clubId_parentUserId_fkey" FOREIGN KEY ("clubId", "parentUserId") REFERENCES "ClubMembership"("clubId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvitation" ADD CONSTRAINT "ClubInvitation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvitation" ADD CONSTRAINT "ClubInvitation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInvitation" ADD CONSTRAINT "ClubInvitation_invitedByMembershipId_clubId_fkey" FOREIGN KEY ("invitedByMembershipId", "clubId") REFERENCES "ClubMembership"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventMemo" ADD CONSTRAINT "ClubEventMemo_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventMemo" ADD CONSTRAINT "ClubEventMemo_eventId_clubId_fkey" FOREIGN KEY ("eventId", "clubId") REFERENCES "ClubEvent"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventMemo" ADD CONSTRAINT "ClubEventMemo_membershipId_clubId_fkey" FOREIGN KEY ("membershipId", "clubId") REFERENCES "ClubMembership"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNotice" ADD CONSTRAINT "ClubNotice_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNotice" ADD CONSTRAINT "ClubNotice_updatedByMembershipId_fkey" FOREIGN KEY ("updatedByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNotice" ADD CONSTRAINT "ClubNotice_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventAttachment" ADD CONSTRAINT "ClubEventAttachment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventAttachment" ADD CONSTRAINT "ClubEventAttachment_eventId_clubId_fkey" FOREIGN KEY ("eventId", "clubId") REFERENCES "ClubEvent"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNoticeAttachment" ADD CONSTRAINT "ClubNoticeAttachment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNoticeAttachment" ADD CONSTRAINT "ClubNoticeAttachment_noticeId_clubId_fkey" FOREIGN KEY ("noticeId", "clubId") REFERENCES "ClubNotice"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventRead" ADD CONSTRAINT "ClubEventRead_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventRead" ADD CONSTRAINT "ClubEventRead_eventId_clubId_fkey" FOREIGN KEY ("eventId", "clubId") REFERENCES "ClubEvent"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventRead" ADD CONSTRAINT "ClubEventRead_membershipId_clubId_fkey" FOREIGN KEY ("membershipId", "clubId") REFERENCES "ClubMembership"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNoticeRead" ADD CONSTRAINT "ClubNoticeRead_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNoticeRead" ADD CONSTRAINT "ClubNoticeRead_noticeId_clubId_fkey" FOREIGN KEY ("noticeId", "clubId") REFERENCES "ClubNotice"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubNoticeRead" ADD CONSTRAINT "ClubNoticeRead_membershipId_clubId_fkey" FOREIGN KEY ("membershipId", "clubId") REFERENCES "ClubMembership"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineSetting" ADD CONSTRAINT "ClubLineSetting_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineTarget" ADD CONSTRAINT "ClubLineTarget_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineTarget" ADD CONSTRAINT "ClubLineTarget_lineSettingId_clubId_fkey" FOREIGN KEY ("lineSettingId", "clubId") REFERENCES "ClubLineSetting"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineRegistrationToken" ADD CONSTRAINT "ClubLineRegistrationToken_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineRegistrationToken" ADD CONSTRAINT "ClubLineRegistrationToken_lineSettingId_clubId_fkey" FOREIGN KEY ("lineSettingId", "clubId") REFERENCES "ClubLineSetting"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineRegistrationToken" ADD CONSTRAINT "ClubLineRegistrationToken_createdByMembershipId_clubId_fkey" FOREIGN KEY ("createdByMembershipId", "clubId") REFERENCES "ClubMembership"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEmailSetting" ADD CONSTRAINT "ClubEmailSetting_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportReport" ADD CONSTRAINT "SupportReport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportReport" ADD CONSTRAINT "SupportReport_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportReport" ADD CONSTRAINT "SupportReport_handledByPlatformAdminId_fkey" FOREIGN KEY ("handledByPlatformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineDelivery" ADD CONSTRAINT "ClubLineDelivery_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineDelivery" ADD CONSTRAINT "ClubLineDelivery_targetId_clubId_fkey" FOREIGN KEY ("targetId", "clubId") REFERENCES "ClubLineTarget"("id", "clubId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineDelivery" ADD CONSTRAINT "ClubLineDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClubEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineDelivery" ADD CONSTRAINT "ClubLineDelivery_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ClubNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubLineDelivery" ADD CONSTRAINT "ClubLineDelivery_requestedByMembershipId_fkey" FOREIGN KEY ("requestedByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClubLineDelivery"
ADD CONSTRAINT "ClubLineDelivery_content_source_check"
CHECK (
  (
    "contentType" = 'EVENT'
    AND "noticeId" IS NULL
  )
  OR
  (
    "contentType" = 'NOTICE'
    AND "eventId" IS NULL
  )
);