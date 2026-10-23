-- 【追加】
-- LINE配信の復旧巡回：5分ごと
select cron.schedule(
  'club-line-deliveries-every-5-minutes',
  '*/5 * * * *',
  $cron$
    select net.http_get(
      url := (
        select rtrim(
          decrypted_secret,
          '/'
        )
        from vault.decrypted_secrets
        where name =
          'club_app_cron_base_url'
        limit 1
      ) || '/api/cron/club-line-deliveries',

      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name =
            'club_app_cron_secret'
          limit 1
        ),
        'Accept',
        'application/json',
        'User-Agent',
        'supabase-cron/1.0'
      ),

      /*
       * LINE送信は最大20件を順番に処理するため、
       * pg_netの既定5秒ではなく120秒にする。
       */
      timeout_milliseconds := 120000
    );
  $cron$
);


-- 【追加】
-- Storage削除の復旧巡回：5分ごと
-- LINEと同時刻に集中しないよう、2分ずらす
select cron.schedule(
  'storage-deletions-every-5-minutes',
  '2-59/5 * * * *',
  $cron$
    select net.http_get(
      url := (
        select rtrim(
          decrypted_secret,
          '/'
        )
        from vault.decrypted_secrets
        where name =
          'club_app_cron_base_url'
        limit 1
      ) || '/api/cron/storage-deletions',

      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name =
            'club_app_cron_secret'
          limit 1
        ),
        'Accept',
        'application/json',
        'User-Agent',
        'supabase-cron/1.0'
      ),

      timeout_milliseconds := 120000
    );
  $cron$
);