-- 0021: (1) an email when satisfaction drops sharply, for the business or a branch; (2) survey sends that
-- repeat on a schedule (e.g. a monthly customer-loyalty check), reusing the same list.

-------------------------------------------------------------------------------
-- Drop alerts
-------------------------------------------------------------------------------
alter table public.accounts add column if not exists drop_alerts_enabled boolean not null default true;
grant update (name, ai_insights_enabled, agent_wins_enabled, drop_alerts_enabled) on public.accounts to authenticated;

create table if not exists public.drop_alert_log (
  id         bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  scope      text not null check (scope = 'all' or scope ~ '^[0-9a-f-]{36}$'),
  current_pct numeric(5,1) not null,
  previous_pct numeric(5,1) not null,
  sent_at    timestamptz not null default now()
);
create index if not exists drop_alert_log_idx on public.drop_alert_log (account_id, scope, sent_at desc);
alter table public.drop_alert_log enable row level security;
revoke all on public.drop_alert_log from anon, authenticated;
grant select, insert, delete on public.drop_alert_log to service_role;

-------------------------------------------------------------------------------
-- Repeating sends
-------------------------------------------------------------------------------
alter table public.survey_sends add column if not exists repeat_days smallint check (repeat_days is null or repeat_days in (30, 60, 90));
alter table public.survey_sends add column if not exists next_run_at timestamptz;
alter table public.survey_sends add column if not exists repeat_of uuid references public.survey_sends(id) on delete set null;
create index if not exists survey_sends_repeat_idx on public.survey_sends (next_run_at) where repeat_days is not null;

-- Owners and admins switch repeating on or off for one of their manual sends.
create or replace function public.set_send_repeat(p_send uuid, p_days smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.survey_sends;
begin
  select * into s from public.survey_sends where id = p_send;
  if not found then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(s.account_id, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if s.source <> 'manual' then raise exception 'only manual sends repeat' using errcode = '22023'; end if;
  if p_days is not null and p_days not in (30, 60, 90) then raise exception 'invalid repeat' using errcode = '22023'; end if;
  update public.survey_sends
     set repeat_days = p_days,
         next_run_at = case when p_days is null then null else coalesce(next_run_at, created_at + make_interval(days => p_days)) end
   where id = p_send;
end $$;
revoke all on function public.set_send_repeat(uuid, smallint) from public, anon;
grant execute on function public.set_send_repeat(uuid, smallint) to authenticated;

-- Server only (daily): makes the next send for every repeating send that's due, with the same list.
-- Unsubscribes, bounces and today's limit apply as usual. Returns how many sends were created.
create or replace function public.run_repeat_sends()
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.survey_sends; v_new uuid; v_rows jsonb; v_allow integer; v_count integer := 0;
begin
  for s in
    select * from public.survey_sends
     where repeat_days is not null and next_run_at <= now()
     order by next_run_at
     limit 200
     for update skip locked
  loop
    update public.survey_sends set next_run_at = now() + make_interval(days => s.repeat_days) where id = s.id;
    continue when exists (select 1 from public.accounts a where a.id = s.account_id and a.suspended_at is not null);
    continue when not exists (select 1 from public.surveys v where v.id = s.survey_id and v.status = 'active');
    v_allow := private.send_allowance(s.account_id);
    continue when v_allow <= 0;
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('email', r.email, 'name', r.name, 'agent', r.agent, 'ticket', r.ticket)))
      into v_rows from public.send_recipients r where r.send_id = s.id;
    continue when v_rows is null;
    insert into public.survey_sends (account_id, survey_id, source, name, subject, intro, reply_to, reminder_days, skip_recent_days, created_by, repeat_of)
    values (s.account_id, s.survey_id, 'manual', left(s.name || ' · ' || to_char(now() at time zone 'utc', 'Mon YYYY'), 80), s.subject, s.intro, s.reply_to, s.reminder_days,
            least(s.skip_recent_days, s.repeat_days - 1)::smallint, s.created_by, s.id)
    returning id into v_new;
    perform private.add_send_recipients(v_new, v_rows, v_allow);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.run_repeat_sends() from public, anon, authenticated;
grant execute on function public.run_repeat_sends() to service_role;
