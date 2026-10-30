-- 0031: what the free plan can use. Plans mostly differ by volume; a free (or new, unpaid) business gets
-- the core product, but not: helpdesk/Shopify/Slack/webhook connections, the API, office TV screens,
-- AI drafts and insights, email reports and repeat sends. It can have 1 location and 2 team members.
-- Sending from your own domain is Scale only.
-- Enforced here, in the database, so no route (user or server) can get around it.
-- Keep in step with src/lib/billing/features.ts.

create or replace function private.plan_allows(p_plan text, p_feature text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_feature
    when 'own_domain' then p_plan = 'scale'
    else coalesce(p_plan in ('starter', 'growth', 'scale'), false)
  end;
$$;

create or replace function private.account_allows(p_account uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.plan_allows(a.plan, p_feature) from public.accounts a where a.id = p_account), false);
$$;

create or replace function private.account_limit(p_account uuid, p_what text)
returns integer language sql stable security definer set search_path = '' as $$
  select case when (select a.plan from public.accounts a where a.id = p_account) in ('starter', 'growth', 'scale') then 1000
              when p_what = 'members' then 2
              else 1 end;
$$;

-- Creating something that belongs to a paid feature.
create or replace function private.require_feature()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.account_allows(new.account_id, tg_argv[0]) then
    raise exception 'upgrade required: %', tg_argv[0] using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists integrations_plan on public.integrations;
create trigger integrations_plan before insert on public.integrations for each row execute function private.require_feature('integrations');
drop trigger if exists api_keys_plan on public.api_keys;
create trigger api_keys_plan before insert on public.api_keys for each row execute function private.require_feature('api');
drop trigger if exists tv_screens_plan on public.tv_screens;
create trigger tv_screens_plan before insert on public.tv_screens for each row execute function private.require_feature('tv');
drop trigger if exists report_subscriptions_plan on public.report_subscriptions;
create trigger report_subscriptions_plan before insert on public.report_subscriptions for each row execute function private.require_feature('reports');
drop trigger if exists sending_domains_plan on public.sending_domains;
create trigger sending_domains_plan before insert on public.sending_domains for each row execute function private.require_feature('own_domain');

-- Turning on repeat sends or AI.
create or replace function private.require_repeats_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.repeat_days is not null and old.repeat_days is distinct from new.repeat_days
     and not private.account_allows(new.account_id, 'repeats') then
    raise exception 'upgrade required: repeats' using errcode = '42501';
  end if;
  return new;
end $$;
create or replace function private.require_ai_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ai_insights_enabled and not old.ai_insights_enabled and not private.plan_allows(new.plan, 'ai') then
    raise exception 'upgrade required: ai' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists survey_sends_repeat_plan on public.survey_sends;
create trigger survey_sends_repeat_plan before update of repeat_days on public.survey_sends for each row execute function private.require_repeats_plan();
drop trigger if exists accounts_ai_plan on public.accounts;
create trigger accounts_ai_plan before update of ai_insights_enabled on public.accounts for each row execute function private.require_ai_plan();

-- Locations (active ones) and team members (members + pending invites).
create or replace function private.check_plan_limits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if tg_table_name = 'locations' then
    if new.archived_at is not null then return new; end if;
    if tg_op = 'UPDATE' and old.archived_at is null then return new; end if;
    perform 1 from public.accounts where id = new.account_id for update;  -- one at a time per business
    select count(*) into v_n from public.locations where account_id = new.account_id and archived_at is null and id <> new.id;
    if v_n >= private.account_limit(new.account_id, 'locations') then
      raise exception 'plan limit: locations' using errcode = '42501';
    end if;
  elsif tg_table_name = 'invites' then
    if new.status <> 'pending' then return new; end if;
    if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
    perform 1 from public.accounts where id = new.account_id for update;
    select (select count(*) from public.memberships m where m.account_id = new.account_id)
         + (select count(*) from public.invites i where i.account_id = new.account_id and i.status = 'pending' and i.expires_at > now() and i.id <> new.id)
      into v_n;
    if v_n >= private.account_limit(new.account_id, 'members') then
      raise exception 'plan limit: members' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists locations_plan_limit on public.locations;
create trigger locations_plan_limit before insert or update of archived_at on public.locations for each row execute function private.check_plan_limits();
drop trigger if exists invites_plan_limit on public.invites;
create trigger invites_plan_limit before insert or update of status on public.invites for each row execute function private.check_plan_limits();

-- Repeat sends stop while a business is on the free plan (they start again after it pays).
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
    continue when not private.account_allows(s.account_id, 'repeats');
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

revoke all on function private.plan_allows(text, text) from public;
revoke all on function private.account_allows(uuid, text) from public;
revoke all on function private.account_limit(uuid, text) from public;
revoke all on function private.require_feature() from public;
revoke all on function private.require_repeats_plan() from public;
revoke all on function private.require_ai_plan() from public;
revoke all on function private.check_plan_limits() from public;
