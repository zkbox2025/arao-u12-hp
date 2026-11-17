SELECT
  "id",
  "contentType",
  "eventId",
  "noticeId",
  "requestedAt"
FROM "ClubLineDelivery"
WHERE NOT (
  ("contentType" = 'EVENT' AND "noticeId" IS NULL)
  OR
  ("contentType" = 'NOTICE' AND "eventId" IS NULL)
);
