begin;

update "Club"
set
  "appBaseUrl" =
    'https://condos-std-richards-plasma.trycloudflare.comUrlを',
  "updatedAt" = now()
where
  id = '9ba5ec8d-b7e9-4b41-8592-c6a3b1ece5c4'
  and slug = 'arao-u-12'
returning
  id,
  name,
  slug,
  "appBaseUrl";

commit;