-- F01
-- nullableな履歴参照について、
-- 参照先と参照元のclubId一致を保証する。

-- ============================================================================
-- 【追加】既存制約が失われていないことを確認
-- ============================================================================

DO $f01_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'ClubLineDelivery_content_source_check'
      AND conrelid =
        to_regclass(
          'public."ClubLineDelivery"'
        )
  ) THEN
    RAISE EXCEPTION
      'ClubLineDelivery_content_source_check is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'ClubInvitation'
      AND indexname =
        'ClubInvitation_active_email_key'
      AND indexdef LIKE '%WHERE%'
  ) THEN
    RAISE EXCEPTION
      'ClubInvitation_active_email_key is missing';
  END IF;

  -- ClubInvitation.membershipId
  IF EXISTS (
    SELECT 1
    FROM "ClubInvitation" invitation
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        invitation."membershipId"
    WHERE invitation."membershipId"
      IS NOT NULL
      AND invitation."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubInvitation contains cross-club membership references';
  END IF;

  -- SupportReport.membershipId
  IF EXISTS (
    SELECT 1
    FROM "SupportReport" report
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        report."membershipId"
    WHERE report."membershipId"
      IS NOT NULL
      AND report."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'SupportReport contains cross-club membership references';
  END IF;

  -- ClubEvent作成者
  IF EXISTS (
    SELECT 1
    FROM "ClubEvent" event
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        event."createdByMembershipId"
    WHERE event."createdByMembershipId"
      IS NOT NULL
      AND event."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubEvent contains cross-club creator references';
  END IF;

  -- ClubEvent更新者
  IF EXISTS (
    SELECT 1
    FROM "ClubEvent" event
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        event."updatedByMembershipId"
    WHERE event."updatedByMembershipId"
      IS NOT NULL
      AND event."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubEvent contains cross-club updater references';
  END IF;

  -- ClubNotice作成者
  IF EXISTS (
    SELECT 1
    FROM "ClubNotice" notice
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        notice."createdByMembershipId"
    WHERE notice."createdByMembershipId"
      IS NOT NULL
      AND notice."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubNotice contains cross-club creator references';
  END IF;

  -- ClubNotice更新者
  IF EXISTS (
    SELECT 1
    FROM "ClubNotice" notice
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        notice."updatedByMembershipId"
    WHERE notice."updatedByMembershipId"
      IS NOT NULL
      AND notice."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubNotice contains cross-club updater references';
  END IF;

  -- ClubLineDelivery依頼者
  IF EXISTS (
    SELECT 1
    FROM "ClubLineDelivery" delivery
    INNER JOIN "ClubMembership" membership
      ON membership."id" =
        delivery."requestedByMembershipId"
    WHERE delivery."requestedByMembershipId"
      IS NOT NULL
      AND delivery."clubId" <>
        membership."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubLineDelivery contains cross-club requester references';
  END IF;

  -- ClubLineDelivery元イベント
  IF EXISTS (
    SELECT 1
    FROM "ClubLineDelivery" delivery
    INNER JOIN "ClubEvent" event
      ON event."id" =
        delivery."eventId"
    WHERE delivery."eventId"
      IS NOT NULL
      AND delivery."clubId" <>
        event."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubLineDelivery contains cross-club event references';
  END IF;

  -- ClubLineDelivery元お知らせ
  IF EXISTS (
    SELECT 1
    FROM "ClubLineDelivery" delivery
    INNER JOIN "ClubNotice" notice
      ON notice."id" =
        delivery."noticeId"
    WHERE delivery."noticeId"
      IS NOT NULL
      AND delivery."clubId" <>
        notice."clubId"
  ) THEN
    RAISE EXCEPTION
      'ClubLineDelivery contains cross-club notice references';
  END IF;
END
$f01_preflight$;

-- ============================================================================
-- 【追加】同一クラブ参照を検証する共通trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION
  "enforce_same_club_reference"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  reference_id TEXT;
  reference_club_id TEXT;
BEGIN
  reference_id :=
    to_jsonb(NEW) ->>
      TG_ARGV[0];

  -- SetNullされた履歴参照は許可
  IF reference_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT "clubId"
       FROM %I.%I
      WHERE "id" = $1',
    'public',
    TG_ARGV[1]
  )
  INTO reference_club_id
  USING reference_id;

  IF reference_club_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format(
        '%s.%s references a missing row',
        TG_TABLE_NAME,
        TG_ARGV[0]
      ),
      CONSTRAINT = TG_NAME;
  END IF;

  IF reference_club_id
    IS DISTINCT FROM
    NEW."clubId"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        '%s.%s belongs to another club',
        TG_TABLE_NAME,
        TG_ARGV[0]
      ),
      CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END
$function$;

-- ClubInvitation.membershipId
DROP TRIGGER IF EXISTS
  "ClubInvitation_membership_club_match"
ON "ClubInvitation";

CREATE TRIGGER
  "ClubInvitation_membership_club_match"
BEFORE INSERT OR UPDATE
ON "ClubInvitation"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'membershipId',
    'ClubMembership'
  );

-- SupportReport.membershipId
DROP TRIGGER IF EXISTS
  "SupportReport_membership_club_match"
ON "SupportReport";

CREATE TRIGGER
  "SupportReport_membership_club_match"
BEFORE INSERT OR UPDATE
ON "SupportReport"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'membershipId',
    'ClubMembership'
  );

-- ClubEvent.createdByMembershipId
DROP TRIGGER IF EXISTS
  "ClubEvent_created_by_club_match"
ON "ClubEvent";

CREATE TRIGGER
  "ClubEvent_created_by_club_match"
BEFORE INSERT OR UPDATE
ON "ClubEvent"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'createdByMembershipId',
    'ClubMembership'
  );

-- ClubEvent.updatedByMembershipId
DROP TRIGGER IF EXISTS
  "ClubEvent_updated_by_club_match"
ON "ClubEvent";

CREATE TRIGGER
  "ClubEvent_updated_by_club_match"
BEFORE INSERT OR UPDATE
ON "ClubEvent"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'updatedByMembershipId',
    'ClubMembership'
  );

-- ClubNotice.createdByMembershipId
DROP TRIGGER IF EXISTS
  "ClubNotice_created_by_club_match"
ON "ClubNotice";

CREATE TRIGGER
  "ClubNotice_created_by_club_match"
BEFORE INSERT OR UPDATE
ON "ClubNotice"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'createdByMembershipId',
    'ClubMembership'
  );

-- ClubNotice.updatedByMembershipId
DROP TRIGGER IF EXISTS
  "ClubNotice_updated_by_club_match"
ON "ClubNotice";

CREATE TRIGGER
  "ClubNotice_updated_by_club_match"
BEFORE INSERT OR UPDATE
ON "ClubNotice"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'updatedByMembershipId',
    'ClubMembership'
  );

-- ClubLineDelivery.requestedByMembershipId
DROP TRIGGER IF EXISTS
  "ClubLineDelivery_requester_club_match"
ON "ClubLineDelivery";

CREATE TRIGGER
  "ClubLineDelivery_requester_club_match"
BEFORE INSERT OR UPDATE
ON "ClubLineDelivery"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'requestedByMembershipId',
    'ClubMembership'
  );

-- ClubLineDelivery.eventId
DROP TRIGGER IF EXISTS
  "ClubLineDelivery_event_club_match"
ON "ClubLineDelivery";

CREATE TRIGGER
  "ClubLineDelivery_event_club_match"
BEFORE INSERT OR UPDATE
ON "ClubLineDelivery"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'eventId',
    'ClubEvent'
  );

-- ClubLineDelivery.noticeId
DROP TRIGGER IF EXISTS
  "ClubLineDelivery_notice_club_match"
ON "ClubLineDelivery";

CREATE TRIGGER
  "ClubLineDelivery_notice_club_match"
BEFORE INSERT OR UPDATE
ON "ClubLineDelivery"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_same_club_reference"(
    'noticeId',
    'ClubNotice'
  );

-- ============================================================================
-- 【追加】新規LINE履歴には元コンテンツを必須とする
--
-- 削除後はFKのSetNullによりnullを許可する必要があるため、
-- INSERT時だけ検証する。
-- ============================================================================

CREATE OR REPLACE FUNCTION
  "require_line_delivery_source_on_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (
    NEW."contentType" = 'EVENT'
    AND (
      NEW."eventId" IS NULL
      OR NEW."noticeId" IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE =
        'EVENT delivery requires eventId only',
      CONSTRAINT =
        'ClubLineDelivery_source_required_on_insert';
  END IF;

  IF (
    NEW."contentType" = 'NOTICE'
    AND (
      NEW."noticeId" IS NULL
      OR NEW."eventId" IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE =
        'NOTICE delivery requires noticeId only',
      CONSTRAINT =
        'ClubLineDelivery_source_required_on_insert';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS
  "ClubLineDelivery_source_required_on_insert"
ON "ClubLineDelivery";

CREATE TRIGGER
  "ClubLineDelivery_source_required_on_insert"
BEFORE INSERT
ON "ClubLineDelivery"
FOR EACH ROW
EXECUTE FUNCTION
  "require_line_delivery_source_on_insert"();

-- ============================================================================
-- 【追加】クラブスコープ付き親データのclubId変更を禁止する
-- ============================================================================

CREATE OR REPLACE FUNCTION
  "prevent_club_id_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."clubId"
    IS DISTINCT FROM
    OLD."clubId"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        '%s.clubId cannot be changed',
        TG_TABLE_NAME
      ),
      CONSTRAINT = TG_NAME;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS
  "ClubMembership_club_id_immutable"
ON "ClubMembership";

CREATE TRIGGER
  "ClubMembership_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubMembership"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "ClubEvent_club_id_immutable"
ON "ClubEvent";

CREATE TRIGGER
  "ClubEvent_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubEvent"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "ClubNotice_club_id_immutable"
ON "ClubNotice";

CREATE TRIGGER
  "ClubNotice_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubNotice"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "ClubLineTarget_club_id_immutable"
ON "ClubLineTarget";

CREATE TRIGGER
  "ClubLineTarget_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubLineTarget"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "ClubInvitation_club_id_immutable"
ON "ClubInvitation";

CREATE TRIGGER
  "ClubInvitation_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubInvitation"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "SupportReport_club_id_immutable"
ON "SupportReport";

CREATE TRIGGER
  "SupportReport_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "SupportReport"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();

DROP TRIGGER IF EXISTS
  "ClubLineDelivery_club_id_immutable"
ON "ClubLineDelivery";

CREATE TRIGGER
  "ClubLineDelivery_club_id_immutable"
BEFORE UPDATE OF "clubId"
ON "ClubLineDelivery"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_club_id_change"();