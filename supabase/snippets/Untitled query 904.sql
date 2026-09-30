select
  jobid,
  jobname,
  schedule,
  active
from cron.job
where jobname in (
  'club-line-deliveries-every-5-minutes',
  'storage-deletions-every-5-minutes'
)
order by jobname;