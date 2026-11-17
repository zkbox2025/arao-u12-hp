select
  id,
  name,
  decrypted_secret
    as current_base_url
from vault.decrypted_secrets
where name =
  'club_app_cron_base_url';
  