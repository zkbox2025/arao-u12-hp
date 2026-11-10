SELECT
  id,
  email
FROM auth.users
WHERE LOWER(email) = LOWER('kzy.migita@gmail.com');