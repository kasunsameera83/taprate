-- Daily survey-email limits by plan. Before this, every plan except trial (free and paused included)
-- could send 2,000 emails a day. Each email costs us money and a free account sending in bulk could
-- get our sending domain blocked for everyone, so the limit now follows what the business pays for.
-- Keep in step with SEND_LIMITS in src/lib/billing/catalog.ts.
create or replace function private.daily_send_limit(p_plan text)
returns integer language sql immutable set search_path = '' as $$
  select case p_plan
    when 'scale'   then 5000
    when 'growth'  then 2000
    when 'starter' then 500
    when 'trial'   then 100
    when 'free'    then 100
    else 0                       -- paused, or anything unknown: no sending
  end;
$$;
revoke all on function private.daily_send_limit(text) from public;

create or replace function private.send_allowance(p_account uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0,
    private.daily_send_limit(a.plan)
    - (select count(*) from public.send_recipients r
       where r.account_id = p_account and r.status in ('queued', 'sending', 'sent', 'failed')
         and r.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::integer)
  from public.accounts a where a.id = p_account;
$$;
revoke all on function private.send_allowance(uuid) from public;
