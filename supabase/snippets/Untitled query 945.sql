SELECT DISTINCT
  tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tableowner;SHOW server_version;