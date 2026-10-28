-- 0013: TapRate sends the survey email for the business.
--   * A "send" is one email to a list of customers (up to 1,000), with an optional single reminder.
--   * People who unsubscribed from this business, or whose address bounced or complained, are never
--     emailed again. People emailed by this business recently can be skipped (survey fatigue).
--   * Daily limits per business stop the feature being used to send spam (trial: 100 a day).
--   * Everything is created through the functions below, which check the role and every value again;
--     users can read sends and recipients but never write those tables directly.

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table if not exists public.survey_sends (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  survey_id         uuid not null references public.surveys(id) on delete cascade,
  source            text not null default 'manual' check (source in ('manual', 'api')),
  name              text not null check (char_length(name) between 1 and 80),
  subject           text not null check (char_length(subject) between 1 and 150 and subject !~ '[[:cntrl:]]'),
  intro             text not null default '' check (char_length(intro) <= 1000 and intro !~ '[\x01-\x09\x0b-\x1f\x7f]'),
  reply_to          text check (reply_to is null or (char_length(reply_to) <= 254 and reply_to ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$')),
  reminder_days     smallint check (reminder_days is null or reminder_days between 2 and 14),
  skip_recent_days  smallint not null default 30 check (skip_recent_days between 0 and 365),
  recipient_count   integer not null default 0 check (recipient_count >= 0),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  -- API sends collect one day's API recipients for a survey in one row.
  api_day           date,
  unique (survey_id, api_day)
);
create index if not exists survey_sends_account_idx on public.survey_sends (account_id, created_at desc);

create table if not exists public.send_recipients (
  id          uuid primary key default gen_random_uuid(),
  send_id     uuid not null references public.survey_sends(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  survey_id   uuid not null references public.surveys(id) on delete cascade,
  email       text not null check (char_length(email) <= 254 and email = lower(email) and email ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$'),
  name        text check (name is null or (char_length(name) between 1 and 80 and name !~ '[[:cntrl:]<>]')),
  agent       text check (agent is null or (char_length(agent) between 1 and 100 and agent !~ '[[:cntrl:]<>]')),
  ticket      text check (ticket is null or ticket ~ '^[A-Za-z0-9#._/-]{1,100}$'),
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped_recent', 'suppressed')),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (send_id, email)
);
create index if not exists send_recipients_send_idx on public.send_recipients (send_id, status);
create index if not exists send_recipients_recent_idx on public.send_recipients (account_id, email, sent_at desc);
create index if not exists send_recipients_queue_idx on public.send_recipients (status, created_at) where status in ('queued', 'sending');
create index if not exists send_recipients_remind_idx on public.send_recipients (sent_at) where status = 'sent' and reminded_at is null;

-- account_id null = applies to every business (bounces and spam complaints hurt everyone's delivery).
create table if not exists public.email_suppressions (
  id         bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  email      text not null check (char_length(email) <= 254 and email = lower(email)),
  reason     text not null check (reason in ('unsubscribed', 'bounced', 'complained', 'added_by_team')),
  created_at timestamptz not null default now()
);
create unique index if not exists email_suppressions_unique on public.email_suppressions (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), email);

-------------------------------------------------------------------------------
-- Access: read for owners, admins and viewers; no direct writes.
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['survey_sends', 'send_recipients'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(account_id, array[''owner'', ''admin'', ''viewer'']))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_mfa', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())', t || '_mfa', t);
  end loop;
end $$;

alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;
grant select on public.email_suppressions to authenticated;
grant select, insert, update, delete on public.email_suppressions to service_role;
drop policy if exists email_suppressions_select on public.email_suppressions;
-- Teams see their own business's list only (never the shared bounce list).
create policy email_suppressions_select on public.email_suppressions for select to authenticated
  using (account_id is not null and public.has_role(account_id, array['owner', 'admin']));
drop policy if exists email_suppressions_mfa on public.email_suppressions;
create policy email_suppressions_mfa on public.email_suppressions as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

create or replace function private.valid_email(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) <= 254 and p ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$';
$$;

-- How many emails this business may still queue today (UTC day). Trials get a small allowance.
create or replace function private.send_allowance(p_account uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0,
    (case when a.plan = 'trial' then 100 else 2000 end)
    - (select count(*) from public.send_recipients r
       where r.account_id = p_account and r.status in ('queued', 'sending', 'sent', 'failed')
         and r.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::integer)
  from public.accounts a where a.id = p_account;
$$;

-- Adds recipients to a send, deciding for each whether it is queued, suppressed or skipped.
-- Rows must already be validated; returns counts.
create or replace function private.add_send_recipients(p_send uuid, p_rows jsonb, p_allowance integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.survey_sends; v_inserted integer; v_queued integer; v_supp integer; v_recent integer;
begin
  select * into s from public.survey_sends where id = p_send;
  with src as (
    select distinct on (lower(btrim(r ->> 'email')))
      lower(btrim(r ->> 'email')) as email,
      nullif(btrim(r ->> 'name'), '') as name,
      nullif(btrim(r ->> 'agent'), '') as agent,
      nullif(btrim(r ->> 'ticket'), '') as ticket,
      ord
    from jsonb_array_elements(p_rows) with ordinality as x(r, ord)
    order by lower(btrim(r ->> 'email')), ord
  ), decided as (
    select src.*,
      case
        when exists (select 1 from public.email_suppressions e where e.email = src.email and (e.account_id = s.account_id or e.account_id is null)) then 'suppressed'
        when s.skip_recent_days > 0 and exists (
          select 1 from public.send_recipients p
          where p.account_id = s.account_id and p.email = src.email and p.sent_at > now() - make_interval(days => s.skip_recent_days)
        ) then 'skipped_recent'
        else 'queued'
      end as decision
    from src
  ), ranked as (
    select d.*, row_number() over (partition by (d.decision = 'queued') order by d.ord) as qn from decided d
  )
  insert into public.send_recipients (send_id, account_id, survey_id, email, name, agent, ticket, status)
  select p_send, s.account_id, s.survey_id, email, name, agent, ticket, decision
  from ranked
  where decision <> 'queued' or qn <= p_allowance
  on conflict (send_id, email) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*) filter (where status = 'queued'), count(*) filter (where status = 'suppressed'), count(*) filter (where status = 'skipped_recent')
    into v_queued, v_supp, v_recent
  from public.send_recipients where send_id = p_send;
  update public.survey_sends set recipient_count = (select count(*) from public.send_recipients where send_id = p_send) where id = p_send;
  return jsonb_build_object('added', v_inserted, 'queued', v_queued, 'suppressed', v_supp, 'skipped_recent', v_recent);
end $$;

create or replace function private.check_send_rows(p_rows jsonb, p_max integer)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and p_max then
    raise exception 'invalid recipients' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) <> 'object'
       or exists (select 1 from jsonb_object_keys(r) k where k not in ('email', 'name', 'agent', 'ticket'))
       or jsonb_typeof(r -> 'email') is distinct from 'string' or not private.valid_email(lower(btrim(r ->> 'email')))
       or (r ? 'name' and (jsonb_typeof(r -> 'name') <> 'string' or char_length(btrim(r ->> 'name')) > 80 or (r ->> 'name') ~ '[[:cntrl:]<>]'))
       or (r ? 'agent' and (jsonb_typeof(r -> 'agent') <> 'string' or char_length(btrim(r ->> 'agent')) > 100 or (r ->> 'agent') ~ '[[:cntrl:]<>]'))
       or (r ? 'ticket' and (jsonb_typeof(r -> 'ticket') <> 'string' or (btrim(r ->> 'ticket') <> '' and btrim(r ->> 'ticket') !~ '^[A-Za-z0-9#._/-]{1,100}$')))
  ) then
    raise exception 'invalid recipient' using errcode = '22023';
  end if;
end $$;

-------------------------------------------------------------------------------
-- Creating a send (team members, through the app)
-------------------------------------------------------------------------------

create or replace function public.create_survey_send(
  p_account uuid, p_survey uuid, p_name text, p_subject text, p_intro text, p_reply_to text,
  p_reminder_days smallint, p_skip_recent_days smallint, p_recipients jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text; v_send uuid; v_allow integer; v_result jsonb; v_distinct integer;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if exists (select 1 from public.accounts where id = p_account and suspended_at is not null) then
    raise exception 'business is suspended' using errcode = '42501';
  end if;
  select status into v_status from public.surveys where id = p_survey and account_id = p_account;
  if v_status is null then perform private.forbid('not found'); end if;
  if v_status <> 'active' then raise exception 'survey is not active' using errcode = '22023'; end if;
  perform private.check_send_rows(p_recipients, 1000);
  v_allow := private.send_allowance(p_account);
  if v_allow <= 0 then raise exception 'daily send limit reached' using errcode = '54000'; end if;

  insert into public.survey_sends (account_id, survey_id, source, name, subject, intro, reply_to, reminder_days, skip_recent_days, created_by)
  values (p_account, p_survey, 'manual', btrim(p_name), btrim(p_subject), coalesce(p_intro, ''), nullif(lower(btrim(coalesce(p_reply_to, ''))), ''),
          p_reminder_days, coalesce(p_skip_recent_days, 30), auth.uid())
  returning id into v_send;

  v_result := private.add_send_recipients(v_send, p_recipients, v_allow);
  select count(distinct lower(btrim(r ->> 'email'))) into v_distinct from jsonb_array_elements(p_recipients) r;
  return v_result || jsonb_build_object('id', v_send, 'not_added', v_distinct - (v_result ->> 'added')::integer);
end $$;

-------------------------------------------------------------------------------
-- One recipient from the public API (server only; the API key was checked by the server)
-------------------------------------------------------------------------------

create or replace function public.api_send_one(p_account uuid, p_survey uuid, p_row jsonb, p_skip_recent_days smallint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_survey public.surveys; v_send uuid; v_allow integer; v_rec public.send_recipients;
begin
  select * into v_survey from public.surveys where id = p_survey and account_id = p_account;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  if v_survey.status <> 'active' then raise exception 'survey is not active' using errcode = '22023'; end if;
  if exists (select 1 from public.accounts where id = p_account and suspended_at is not null) then
    raise exception 'business is suspended' using errcode = '42501';
  end if;
  perform private.check_send_rows(jsonb_build_array(p_row), 1);
  v_allow := private.send_allowance(p_account);
  if v_allow <= 0 then raise exception 'daily send limit reached' using errcode = '54000'; end if;

  insert into public.survey_sends (account_id, survey_id, source, name, subject, skip_recent_days, api_day)
  values (p_account, p_survey, 'api', left('Sent by API · ' || to_char(now() at time zone 'utc', 'DD Mon YYYY'), 80),
          left(v_survey.question, 150), coalesce(p_skip_recent_days, 30), (now() at time zone 'utc')::date)
  on conflict (survey_id, api_day) do update set skip_recent_days = excluded.skip_recent_days
  returning id into v_send;

  -- The same address twice on the same day: answer with the earlier decision instead of a second email.
  select * into v_rec from public.send_recipients where send_id = v_send and email = lower(btrim(p_row ->> 'email'));
  if found then return jsonb_build_object('recipient', v_rec.id, 'status', 'duplicate'); end if;

  perform private.add_send_recipients(v_send, jsonb_build_array(p_row), v_allow);
  select * into v_rec from public.send_recipients where send_id = v_send and email = lower(btrim(p_row ->> 'email'));
  return jsonb_build_object('recipient', v_rec.id, 'status', v_rec.status);
end $$;

-------------------------------------------------------------------------------
-- Sending queue (server only)
-------------------------------------------------------------------------------

-- Takes up to p_limit queued recipients of one send (or of any send when p_send is null), marking them
-- "sending" so two workers never email the same person. Stuck claims are released after 15 minutes.
create or replace function public.claim_send_batch(p_send uuid, p_limit integer)
returns setof public.send_recipients language plpgsql security definer set search_path = '' as $$
begin
  update public.send_recipients set status = 'queued', claimed_at = null
    where status = 'sending' and claimed_at < now() - interval '15 minutes';
  return query
  update public.send_recipients r set status = 'sending', claimed_at = now()
  where r.id in (
    select q.id from public.send_recipients q
    join public.accounts a on a.id = q.account_id
    join public.surveys s on s.id = q.survey_id
    where q.status = 'queued' and (p_send is null or q.send_id = p_send)
      and a.suspended_at is null and s.status = 'active'
      and not exists (select 1 from public.email_suppressions e where e.email = q.email and (e.account_id = q.account_id or e.account_id is null))
    order by q.created_at
    limit least(greatest(p_limit, 1), 200)
    for update of q skip locked
  )
  returning r.*;
end $$;

-- Recipients who got the first email, haven't rated, and whose send asked for a reminder that is now due.
create or replace function public.reminders_due(p_limit integer)
returns setof public.send_recipients language sql stable security definer set search_path = '' as $$
  select r.* from public.send_recipients r
  join public.survey_sends s on s.id = r.send_id
  join public.accounts a on a.id = r.account_id
  join public.surveys sv on sv.id = r.survey_id
  where r.status = 'sent' and r.reminded_at is null and s.reminder_days is not null
    and r.sent_at < now() - make_interval(days => s.reminder_days)
    and r.sent_at > now() - make_interval(days => s.reminder_days + 7)
    and a.suspended_at is null and sv.status = 'active'
    and not exists (select 1 from public.email_suppressions e where e.email = r.email and (e.account_id = r.account_id or e.account_id is null))
    and not exists (
      select 1 from public.responses x
      where x.survey_id = r.survey_id and x.respondent_email = r.email and x.created_at >= r.sent_at
    )
  order by r.sent_at
  limit least(greatest(p_limit, 1), 500);
$$;

-- Per-send numbers for the app (server only, after it has checked the send belongs to the business).
create or replace function public.send_summaries(p_account uuid, p_sends uuid[])
returns table (send_id uuid, total integer, queued integer, sent integer, failed integer, suppressed integer, skipped_recent integer, reminded integer, rated integer)
language sql stable security definer set search_path = '' as $$
  select r.send_id,
    count(*)::integer,
    count(*) filter (where r.status in ('queued', 'sending'))::integer,
    count(*) filter (where r.status = 'sent')::integer,
    count(*) filter (where r.status = 'failed')::integer,
    count(*) filter (where r.status = 'suppressed')::integer,
    count(*) filter (where r.status = 'skipped_recent')::integer,
    count(*) filter (where r.reminded_at is not null)::integer,
    count(*) filter (where r.status = 'sent' and exists (
      select 1 from public.responses x where x.survey_id = r.survey_id and x.respondent_email = r.email and x.created_at >= r.sent_at and x.status = 'confirmed'
    ))::integer
  from public.send_recipients r
  where r.account_id = p_account and r.send_id = any(p_sends)
  group by r.send_id;
$$;

-- Unsubscribe (from the email footer; the server checked the signed link first).
create or replace function public.unsubscribe_recipient(p_recipient uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.send_recipients;
begin
  select * into r from public.send_recipients where id = p_recipient;
  if not found then return false; end if;
  insert into public.email_suppressions (account_id, email, reason) values (r.account_id, r.email, 'unsubscribed')
    on conflict do nothing;
  update public.send_recipients set status = 'suppressed' where account_id = r.account_id and email = r.email and status = 'queued';
  return true;
end $$;

-- Bounces and spam complaints reported by the email provider: never email that address again.
create or replace function public.suppress_globally(p_email text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_reason not in ('bounced', 'complained') or not private.valid_email(lower(btrim(p_email))) then
    raise exception 'invalid suppression' using errcode = '22023';
  end if;
  insert into public.email_suppressions (account_id, email, reason) values (null, lower(btrim(p_email)), p_reason)
    on conflict do nothing;
  update public.send_recipients set status = 'suppressed' where email = lower(btrim(p_email)) and status = 'queued';
end $$;

-- Owners and admins can add addresses their business must never email (e.g. a customer asked by phone).
create or replace function public.add_suppression(p_account uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if not private.valid_email(lower(btrim(p_email))) then raise exception 'invalid email' using errcode = '22023'; end if;
  insert into public.email_suppressions (account_id, email, reason) values (p_account, lower(btrim(p_email)), 'added_by_team')
    on conflict do nothing;
  update public.send_recipients set status = 'suppressed' where account_id = p_account and email = lower(btrim(p_email)) and status = 'queued';
end $$;

-- Only addresses the team added themselves can be removed; a customer's own unsubscribe can't be undone by the business.
create or replace function public.remove_suppression(p_account uuid, p_email text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  delete from public.email_suppressions where account_id = p_account and email = lower(btrim(p_email)) and reason = 'added_by_team';
  get diagnostics v = row_count;
  return v;
end $$;

-- Stop a send that is still going out.
create or replace function public.cancel_survey_send(p_send uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v integer;
begin
  select account_id into v_account from public.survey_sends where id = p_send;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  delete from public.send_recipients where send_id = p_send and status = 'queued';
  get diagnostics v = row_count;
  update public.survey_sends set reminder_days = null, recipient_count = (select count(*) from public.send_recipients where send_id = p_send) where id = p_send;
  return v;
end $$;

-------------------------------------------------------------------------------
-- Privacy: erasing a customer also removes them from send lists (their unsubscribe is kept).
-------------------------------------------------------------------------------

create or replace function public.erase_customer_data(p_account uuid, p_email text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then
    perform private.forbid();
  end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'email required' using errcode = '22023'; end if;
  delete from public.send_recipients where account_id = p_account and email = lower(btrim(p_email));
  with d as (
    delete from public.responses
    where account_id = p_account and lower(respondent_email) = lower(btrim(p_email))
    returning 1
  )
  select count(*)::integer into v_count from d;
  return v_count;
end $$;

-------------------------------------------------------------------------------
-- Housekeeping: recipient lists are kept for 13 months.
-------------------------------------------------------------------------------

create or replace function public.sending_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rec integer; v_sends integer;
begin
  with d as (delete from public.send_recipients where created_at < now() - interval '400 days' returning 1) select count(*) into v_rec from d;
  with d as (
    delete from public.survey_sends s where s.created_at < now() - interval '400 days'
      and not exists (select 1 from public.send_recipients r where r.send_id = s.id) returning 1
  ) select count(*) into v_sends from d;
  return jsonb_build_object('recipients', v_rec, 'sends', v_sends);
end $$;

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

revoke all on function private.valid_email(text) from public;
revoke all on function private.send_allowance(uuid) from public;
revoke all on function private.add_send_recipients(uuid, jsonb, integer) from public;
revoke all on function private.check_send_rows(jsonb, integer) from public;

revoke all on function public.create_survey_send(uuid, uuid, text, text, text, text, smallint, smallint, jsonb) from public, anon;
grant execute on function public.create_survey_send(uuid, uuid, text, text, text, text, smallint, smallint, jsonb) to authenticated;
revoke all on function public.add_suppression(uuid, text) from public, anon;
grant execute on function public.add_suppression(uuid, text) to authenticated;
revoke all on function public.remove_suppression(uuid, text) from public, anon;
grant execute on function public.remove_suppression(uuid, text) to authenticated;
revoke all on function public.cancel_survey_send(uuid) from public, anon;
grant execute on function public.cancel_survey_send(uuid) to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.api_send_one(uuid, uuid, jsonb, smallint)',
    'public.claim_send_batch(uuid, integer)',
    'public.reminders_due(integer)',
    'public.send_summaries(uuid, uuid[])',
    'public.unsubscribe_recipient(uuid)',
    'public.suppress_globally(text, text)',
    'public.sending_cleanup()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
