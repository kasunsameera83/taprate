-- 0018: "Did we fix it?" When a follow-up is resolved, the customer gets one email asking how they feel
-- now. Their answer is linked to the original rating (signed link), so the dashboard can show how many
-- unhappy customers were won back.

alter table public.surveys add column if not exists recovery_email boolean not null default true;
grant update (recovery_email) on public.surveys to authenticated;

alter table public.responses add column if not exists recovery_of uuid references public.responses(id) on delete set null;
alter table public.responses add column if not exists recovery_sent_at timestamptz;
create index if not exists responses_recovery_idx on public.responses (account_id, created_at desc) where recovery_of is not null;

-- Sends can now be recovery emails too; one automatic send row per survey, kind and day.
alter table public.survey_sends drop constraint if exists survey_sends_source_check;
alter table public.survey_sends add constraint survey_sends_source_check check (source in ('manual', 'api', 'recovery'));
alter table public.survey_sends drop constraint if exists survey_sends_survey_id_api_day_key;
alter table public.survey_sends drop constraint if exists survey_sends_survey_source_day_key;
alter table public.survey_sends add constraint survey_sends_survey_source_day_key unique (survey_id, source, api_day);

alter table public.send_recipients add column if not exists recovery_of uuid references public.responses(id) on delete cascade;

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
  on conflict (survey_id, source, api_day) do update set skip_recent_days = excluded.skip_recent_days
  returning id into v_send;

  -- The same address twice on the same day: answer with the earlier decision instead of a second email.
  select * into v_rec from public.send_recipients where send_id = v_send and email = lower(btrim(p_row ->> 'email'));
  if found then return jsonb_build_object('recipient', v_rec.id, 'status', 'duplicate'); end if;

  perform private.add_send_recipients(v_send, jsonb_build_array(p_row), v_allow);
  select * into v_rec from public.send_recipients where send_id = v_send and email = lower(btrim(p_row ->> 'email'));
  return jsonb_build_object('recipient', v_rec.id, 'status', v_rec.status);
end $$;

-- Server only, called right after a follow-up is resolved. Queues the "did we fix it?" email when it makes
-- sense: there's an email address, the survey wants it, it hasn't been sent for this rating before, the
-- person hasn't unsubscribed, and today's email allowance isn't used up. Returns the send id, or null.
create or replace function public.queue_recovery(p_response uuid, p_subject text, p_intro text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.responses; s public.surveys; v_send uuid; v_email text;
begin
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 150 or p_subject ~ '[[:cntrl:]]' or char_length(coalesce(p_intro, '')) > 1000 then
    raise exception 'invalid recovery text' using errcode = '22023';
  end if;
  select * into r from public.responses where id = p_response for update;
  if not found or r.followup_status is distinct from 'resolved' or r.recovery_sent_at is not null or r.recovery_of is not null then return null; end if;
  v_email := lower(btrim(coalesce(r.respondent_email, '')));
  if not private.valid_email(v_email) then return null; end if;
  select * into s from public.surveys where id = r.survey_id;
  if not s.recovery_email or s.status <> 'active' then return null; end if;
  if exists (select 1 from public.accounts where id = r.account_id and suspended_at is not null) then return null; end if;
  if exists (select 1 from public.email_suppressions e where e.email = v_email and (e.account_id = r.account_id or e.account_id is null)) then return null; end if;
  if private.send_allowance(r.account_id) <= 0 then return null; end if;

  insert into public.survey_sends (account_id, survey_id, source, name, subject, intro, skip_recent_days, api_day)
  values (r.account_id, r.survey_id, 'recovery', left('Did we fix it? · ' || to_char(now() at time zone 'utc', 'DD Mon YYYY'), 80),
          btrim(p_subject), coalesce(p_intro, ''), 0, (now() at time zone 'utc')::date)
  on conflict (survey_id, source, api_day) do update set subject = excluded.subject, intro = excluded.intro
  returning id into v_send;

  insert into public.send_recipients (send_id, account_id, survey_id, email, agent, ticket, status, recovery_of)
  values (v_send, r.account_id, r.survey_id, v_email, r.agent,
          case when r.ticket_ref ~ '^[A-Za-z0-9#._/-]{1,100}$' then r.ticket_ref else null end, 'queued', r.id)
  on conflict (send_id, email) do nothing;
  if not found then return null; end if;

  update public.survey_sends set recipient_count = (select count(*) from public.send_recipients where send_id = v_send) where id = v_send;
  update public.responses set recovery_sent_at = now() where id = r.id;
  return v_send;
end $$;
revoke all on function public.queue_recovery(uuid, text, text) from public, anon, authenticated;
grant execute on function public.queue_recovery(uuid, text, text) to service_role;

drop function if exists public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text, uuid);

create or replace function public.record_click(
  p_survey uuid, p_rating smallint, p_dedupe_key text,
  p_email text, p_agent text, p_ticket text, p_verified boolean,
  p_ip_hash text, p_user_agent text, p_channel text default 'email', p_location uuid default null, p_recovery_of uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_status text; v_balance integer; v_suspended timestamptz; v_id uuid; v_location uuid; v_recovery uuid;
begin
  if p_channel not in ('email', 'qr', 'whatsapp', 'sms', 'link', 'web') then
    raise exception 'invalid channel';
  end if;
  select s.account_id, s.status, a.credit_balance, a.suspended_at into v_account, v_status, v_balance, v_suspended
  from public.surveys s join public.accounts a on a.id = s.account_id
  where s.id = p_survey;

  if v_account is null or v_status <> 'active' or v_balance <= 0 or v_suspended is not null then
    return null;
  end if;
  if p_location is not null then v_location := private.valid_location(v_account, p_location); end if;
  -- A "did we fix it?" answer: only for an original rating of this same survey that isn't itself an answer.
  if p_recovery_of is not null then
    select o.id into v_recovery from public.responses o
     where o.id = p_recovery_of and o.survey_id = p_survey and o.account_id = v_account and o.recovery_of is null and o.recovery_sent_at is not null;
  end if;

  insert into public.responses as r (
    account_id, survey_id, pending_rating, status, respondent_email, agent, ticket_ref,
    metadata_verified, dedupe_key, ip_hash, user_agent, channel, location_id, recovery_of
  ) values (
    v_account, p_survey, p_rating, 'pending', p_email, p_agent, p_ticket,
    coalesce(p_verified, false), p_dedupe_key, p_ip_hash, left(p_user_agent, 300), p_channel, v_location, v_recovery
  )
  on conflict (survey_id, dedupe_key) do update set
    pending_rating = excluded.pending_rating,
    ip_hash = excluded.ip_hash,
    user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text, uuid, uuid) to service_role;
