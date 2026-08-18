SELECT
  c.id AS "clubId",
  c.name AS "clubName",
  c.slug,
  c."planType",
  c.timezone,
  u.id AS "userId",
  u.name AS "userName",
  u.email,
  m.id AS "membershipId",
  m.role,
  m.status,
  m."canManageWebsite"
FROM public."Club" c
JOIN public."ClubMembership" m
  ON m."clubId" = c.id
JOIN public."AppUser" u
  ON u.id = m."userId"
WHERE c.slug = 'arao-u12-dev'
  AND u.email = 'kzy.migita@gmail.com';