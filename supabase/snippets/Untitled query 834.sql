SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'ClubLineDelivery'
  AND indexname =
    'ClubLineDelivery_club_request_target_key';