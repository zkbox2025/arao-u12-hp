-- prisma/migrations/20261128000000_club_join_link/migration.sql
-- 参加リンク(共有URL・QRコード)と、参加リンクからの申請のテーブルを追加する(追加のみ)。
-- 設計:docs/implementation/phases/member-join-link-plan.md
-- 既存のテーブル・列・enum・データは変更しない。パスワードは保存しない。
-- CHECK・部分一意索引・triggerは、Prisma schemaで表現できないため、このmigrationで定義する。
-- F01の同クラブ参照・clubId不変の共通関数が、適用済みであることを前提とする。

BEGIN;

-- CreateEnum
CREATE TYPE "ClubJoinRequestStatus" AS ENUM ('AWAITING_EMAIL_CONFIRMATION', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "ClubJoinLink" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clubId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT,

    CONSTRAINT "ClubJoinLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubJoinRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clubId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ClubJoinRequestStatus" NOT NULL DEFAULT 'AWAITING_EMAIL_CONFIRMATION',
    "confirmationExpiresAt" TIMESTAMP(3) NOT NULL,
    "emailConfirmedAt" TIMESTAMP(3),
    "verificationCode" TEXT,
    "codeIssuedAt" TIMESTAMP(3),
    "codeExpiresAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByMembershipId" TEXT,
    "membershipId" TEXT,

    CONSTRAINT "ClubJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubJoinLink_tokenHash_key" ON "ClubJoinLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ClubJoinLink_clubId_revokedAt_expiresAt_idx" ON "ClubJoinLink"("clubId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ClubJoinLink_createdByMembershipId_idx" ON "ClubJoinLink"("createdByMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubJoinLink_id_clubId_key" ON "ClubJoinLink"("id", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubJoinRequest_membershipId_key" ON "ClubJoinRequest"("membershipId");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_clubId_status_createdAt_idx" ON "ClubJoinRequest"("clubId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_authUserId_idx" ON "ClubJoinRequest"("authUserId");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_status_confirmationExpiresAt_idx" ON "ClubJoinRequest"("status", "confirmationExpiresAt");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_status_codeExpiresAt_idx" ON "ClubJoinRequest"("status", "codeExpiresAt");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_linkId_idx" ON "ClubJoinRequest"("linkId");

-- CreateIndex
CREATE INDEX "ClubJoinRequest_decidedByMembershipId_idx" ON "ClubJoinRequest"("decidedByMembershipId");

-- AddForeignKey
ALTER TABLE "ClubJoinLink" ADD CONSTRAINT "ClubJoinLink_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubJoinLink" ADD CONSTRAINT "ClubJoinLink_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubJoinRequest" ADD CONSTRAINT "ClubJoinRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubJoinRequest" ADD CONSTRAINT "ClubJoinRequest_linkId_clubId_fkey" FOREIGN KEY ("linkId", "clubId") REFERENCES "ClubJoinLink"("id", "clubId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubJoinRequest" ADD CONSTRAINT "ClubJoinRequest_decidedByMembershipId_fkey" FOREIGN KEY ("decidedByMembershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubJoinRequest" ADD CONSTRAINT "ClubJoinRequest_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ClubMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- クラブに、無効化されていない参加リンクは、1件だけにする。
CREATE UNIQUE INDEX "ClubJoinLink_clubId_active_key"
    ON public."ClubJoinLink" ("clubId")
    WHERE "revokedAt" IS NULL;

-- 承認待ちの申請の中で、クラブごとに、数字が重複しないようにする。
CREATE UNIQUE INDEX "ClubJoinRequest_clubId_code_awaiting_key"
    ON public."ClubJoinRequest" ("clubId", "verificationCode")
    WHERE "status" = 'AWAITING_APPROVAL';

-- 同じ人(Authユーザー)・同じメールの、進行中の申請は、クラブごとに1件だけにする。
CREATE UNIQUE INDEX "ClubJoinRequest_clubId_authUserId_open_key"
    ON public."ClubJoinRequest" ("clubId", "authUserId")
    WHERE "status" IN ('AWAITING_EMAIL_CONFIRMATION', 'AWAITING_APPROVAL');

CREATE UNIQUE INDEX "ClubJoinRequest_clubId_email_open_key"
    ON public."ClubJoinRequest" ("clubId", "email")
    WHERE "status" IN ('AWAITING_EMAIL_CONFIRMATION', 'AWAITING_APPROVAL');

-- 参加リンクの形式を限定する。
ALTER TABLE public."ClubJoinLink"
    ADD CONSTRAINT "ClubJoinLink_token_hash_check"
        CHECK (
            char_length("tokenHash") = 64 -- SHA-256の16進表記の文字数を検証する関数
            AND "tokenHash" ~ '^[0-9a-f]{64}$'
        ),
    ADD CONSTRAINT "ClubJoinLink_expires_check"
        CHECK ("expiresAt" > "createdAt");

-- 申請の形式と、状態ごとの必須項目を限定する。
ALTER TABLE public."ClubJoinRequest"
    ADD CONSTRAINT "ClubJoinRequest_auth_user_id_check"
        CHECK (
            char_length("authUserId") = 36 -- 文字数を数える関数。末尾の改行等を許可しない
            AND "authUserId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ),
    ADD CONSTRAINT "ClubJoinRequest_email_check"
        CHECK (
            "email" = lower(btrim("email")) -- 小文字化・前後の空白除去済みの値だけを許可する
            AND char_length("email") BETWEEN 3 AND 254
            AND position('@' IN "email") > 1
        ),
    ADD CONSTRAINT "ClubJoinRequest_name_check"
        CHECK (
            "name" = btrim("name")
            AND char_length("name") BETWEEN 1 AND 100
        ),
    ADD CONSTRAINT "ClubJoinRequest_code_format_check"
        CHECK (
            "verificationCode" IS NULL
            OR "verificationCode" ~ '^[0-9]{6}$'
        ),
    ADD CONSTRAINT "ClubJoinRequest_confirmation_expires_check"
        CHECK ("confirmationExpiresAt" > "createdAt"),
    ADD CONSTRAINT "ClubJoinRequest_status_fields_check"
        CHECK (
            (
                "status" = 'AWAITING_EMAIL_CONFIRMATION'
                AND "verificationCode" IS NULL
                AND "emailConfirmedAt" IS NULL
                AND "codeIssuedAt" IS NULL
                AND "codeExpiresAt" IS NULL
                AND "decidedAt" IS NULL
            )
            OR (
                "status" = 'AWAITING_APPROVAL'
                AND "verificationCode" IS NOT NULL
                AND "emailConfirmedAt" IS NOT NULL
                AND "codeIssuedAt" IS NOT NULL
                AND "codeExpiresAt" IS NOT NULL
                AND "codeExpiresAt" > "codeIssuedAt"
                AND "decidedAt" IS NULL
            )
            OR (
                "status" IN ('APPROVED', 'REJECTED')
                AND "emailConfirmedAt" IS NOT NULL
                AND "decidedAt" IS NOT NULL
            )
            OR "status" = 'EXPIRED'
        );

-- 発行者・承認者・承認で作った所属は、申請・リンクと同じクラブの所属であることを保証する。
CREATE TRIGGER "ClubJoinLink_creator_club_match"
    BEFORE INSERT OR UPDATE
    ON public."ClubJoinLink"
    FOR EACH ROW
    EXECUTE FUNCTION public."enforce_same_club_reference"( -- F01の同クラブ参照検証関数を再利用する
        'createdByMembershipId',
        'ClubMembership'
    );

CREATE TRIGGER "ClubJoinRequest_decider_club_match"
    BEFORE INSERT OR UPDATE
    ON public."ClubJoinRequest"
    FOR EACH ROW
    EXECUTE FUNCTION public."enforce_same_club_reference"(
        'decidedByMembershipId',
        'ClubMembership'
    );

CREATE TRIGGER "ClubJoinRequest_membership_club_match"
    BEFORE INSERT OR UPDATE
    ON public."ClubJoinRequest"
    FOR EACH ROW
    EXECUTE FUNCTION public."enforce_same_club_reference"(
        'membershipId',
        'ClubMembership'
    );

-- 更新によって、別のクラブへ移せないようにする。
CREATE TRIGGER "ClubJoinLink_club_id_immutable"
    BEFORE UPDATE OF "clubId"
    ON public."ClubJoinLink"
    FOR EACH ROW
    EXECUTE FUNCTION public."prevent_club_id_change"(); -- F01のclubId変更禁止関数を再利用する

CREATE TRIGGER "ClubJoinRequest_club_id_immutable"
    BEFORE UPDATE OF "clubId"
    ON public."ClubJoinRequest"
    FOR EACH ROW
    EXECUTE FUNCTION public."prevent_club_id_change"();

-- ブラウザー向けpolicyを作らず、既存のサーバーDB接続だけで利用する。
ALTER TABLE public."ClubJoinLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ClubJoinRequest" ENABLE ROW LEVEL SECURITY;

-- 作成roleのdefault privilegesに依存せず、Data API用ロールとPUBLICから権限を剥奪する。
REVOKE ALL PRIVILEGES
    ON TABLE public."ClubJoinLink", public."ClubJoinRequest"
    FROM PUBLIC, anon, authenticated;

COMMIT;
