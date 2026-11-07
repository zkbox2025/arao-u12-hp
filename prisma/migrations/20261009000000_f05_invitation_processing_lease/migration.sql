BEGIN;

-- 既存emailを自動修正せず、不整合があれば値を出力せずに停止する。
-- normalizeEmail()と同じNFKC・trim・小文字化を確認する。
DO $f05_email_preflight$
DECLARE
  trim_characters CONSTANT TEXT :=
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AppUser"
    WHERE "email" IS NOT NULL
      AND "email" IS DISTINCT FROM
        lower(btrim(normalize("email", NFKC), trim_characters))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'F05 email normalization preflight failed for AppUser',
      CONSTRAINT = 'F05_AppUser_email_normalization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ClubInvitation"
    WHERE "email" IS DISTINCT FROM
      lower(btrim(normalize("email", NFKC), trim_characters))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'F05 email normalization preflight failed for ClubInvitation',
      CONSTRAINT = 'F05_ClubInvitation_email_normalization';
  END IF;
END
$f05_email_preflight$;

ALTER TABLE "ClubInvitation"
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD CONSTRAINT "ClubInvitation_claim_pair_check"
    CHECK (("claimToken" IS NULL) = ("leaseExpiresAt" IS NULL));

CREATE UNIQUE INDEX "ClubInvitation_claimToken_key"
  ON "ClubInvitation" ("claimToken");

CREATE INDEX "ClubInvitation_clubId_status_expiresAt_idx"
  ON "ClubInvitation" ("clubId", "status", "expiresAt");

COMMIT;
