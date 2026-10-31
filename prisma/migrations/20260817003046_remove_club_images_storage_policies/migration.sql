-- club-imagesに関係する既存のStorage Policyをすべて削除する。
-- 読み取りは公開バケットの公開URLを使用し、
-- 書き込みはサーバー専用Service Roleから行う。
DO $$
DECLARE
  target_policy RECORD;
BEGIN
  FOR target_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') LIKE '%club-images%'
        OR COALESCE(with_check, '') LIKE '%club-images%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON storage.objects',
      target_policy.policyname
    );
  END LOOP;
END
$$;