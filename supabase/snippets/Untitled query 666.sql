SELECT
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    COALESCE(qual, '') LIKE '%club-images%'
    OR COALESCE(with_check, '') LIKE '%club-images%'
  )
ORDER BY policyname;