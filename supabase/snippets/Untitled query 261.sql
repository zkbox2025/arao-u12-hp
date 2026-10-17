select
  delivery."createdAt",
  delivery."contentType",
  delivery."contentTitle",
  delivery.status,
  delivery."attemptCount",
  delivery."errorCode",
  delivery."errorDetail",
  delivery."sentAt"
from "ClubLineDelivery" as delivery
inner join "Club" as club
  on club.id = delivery."clubId"
where club.slug = 'arao-u-12'
order by delivery."createdAt" desc
limit 10;