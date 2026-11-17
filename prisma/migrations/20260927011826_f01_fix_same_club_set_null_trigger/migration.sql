-- F01補正
-- ON DELETE SET NULLで複数の履歴参照が同時に解除される際、
-- 変更されていない別の参照用トリガーが
-- 削除途中の行を誤検出する問題を修正する。

CREATE OR REPLACE FUNCTION
  "enforce_same_club_reference"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  reference_id TEXT;
  reference_club_id TEXT;
BEGIN
  /*
   * 【追加】
   * UPDATE時、検査対象の参照IDとclubIdが
   * どちらも変更されていなければ再検査しない。
   *
   * Membership削除時には、
   * createdByMembershipIdとupdatedByMembershipIdが
   * FKのON DELETE SET NULLによって個別に更新される。
   *
   * その途中で変更されていない方のトリガーまで
   * 削除中Membershipを検索しないようにする。
   */
  IF TG_OP = 'UPDATE' THEN
    IF
      (
        to_jsonb(NEW) ->>
          TG_ARGV[0]
      )
        IS NOT DISTINCT FROM
      (
        to_jsonb(OLD) ->>
          TG_ARGV[0]
      )
      AND NEW."clubId"
        IS NOT DISTINCT FROM
          OLD."clubId"
    THEN
      RETURN NEW;
    END IF;
  END IF;

  reference_id :=
    to_jsonb(NEW) ->>
      TG_ARGV[0];

  /*
   * SetNullされた履歴参照は正常な状態なので許可する。
   */
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