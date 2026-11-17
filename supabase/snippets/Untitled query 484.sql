select
  rt."createdAt",
  rt."expiresAt",
  rt."usedAt"
from "ClubLineRegistrationToken" rt
join "Club" c
  on c.id = rt."clubId"
where c.slug = 'arao-u-12'
order by rt."createdAt" desc
limit 5;