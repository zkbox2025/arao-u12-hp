select
  created at time zone
    'Asia/Tokyo'
    as created_jst,

  id as request_id,
  status_code,
  timed_out,
  error_msg
from net._http_response
where created >=
  now() - interval '30 minutes'
order by created desc;