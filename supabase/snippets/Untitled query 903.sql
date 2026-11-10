SELECT
  COUNT(*) AS "membershipCount"
FROM public."ClubMembership" m
JOIN public."Club" c
  ON c.id = m."clubId"
WHERE c.slug = 'arao-u-12';