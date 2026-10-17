select
  t.id,
  t."targetName",
  t."targetRoles",
  t."isEnabled",
  t."createdAt"
from "ClubLineTarget" t
join "Club" c
  on c.id = t."clubId"
where c.slug = 'arao-u-12'
order by t."createdAt" desc;