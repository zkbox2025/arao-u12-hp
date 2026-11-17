select
  target."targetName",
  target."targetRoles",
  target."isEnabled",
  target."createdAt"
from "ClubLineTarget" as target
inner join "Club" as club
  on club.id = target."clubId"
where club.slug = 'arao-u-12'
order by target."createdAt" desc;