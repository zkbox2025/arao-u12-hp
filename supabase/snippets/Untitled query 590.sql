select vault.update_secret(
  (
    select id
    from vault.secrets
    where name =
      'club_app_cron_base_url'
  ),

  'http://192.168.210.198:3000',

  'club_app_cron_base_url',

  'ローカルSupabase Cronから接続するNext.js URL'
);