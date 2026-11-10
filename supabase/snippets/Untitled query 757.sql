SELECT
  "clubId",
  LOWER("email") AS normalized_email,
  COUNT(*) AS invitation_count
FROM "ClubInvitation"
WHERE "status" IN (
  'PREPARING',
  'READY_TO_SEND',
  'SENT',
  'EMAIL_FAILED'
)
GROUP BY
  "clubId",
  LOWER("email")
HAVING COUNT(*) > 1;