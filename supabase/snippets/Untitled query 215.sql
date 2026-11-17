select
  cls."webhookKey"
from "ClubLineSetting" cls
join "Club" c
  on c.id = cls."clubId"
where c.slug = 'arao-u-12';