-- TapRate initial schema
-- Security model:
--   * Every business table carries account_id and has Row Level Security ON.
--   * Signed-in users (role "authenticated") only ever see rows of accounts they belong to.
--   * The anonymous role gets NO table access at all. Public survey clicks go through
--     server routes that use the service role and the narrow functions below.
--   * Sensitive columns (credits, plan) cannot be changed by users even on their own account.

create extension if not exists pgcrypto;

-- Internal schema: not exposed through the Supabase REST API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.accounts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  plan           text not null default 'trial' check (plan in ('trial','starter','growth','scale','paused')),
  credit_balance integer not null default 50 check (credit_balance >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.memberships (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner','admin','viewer')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.surveys (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  question         text not null check (char_length(question) between 1 and 200),
  icon_set         text not null check (icon_set in ('thumbs','faces3','faces5','stars5','nps')),
  brand_color      text not null default '#2563eb' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  thank_you_message text not null default 'Thanks for your feedback!' check (char_length(thank_you_message) between 1 and 300),
  allow_comment    boolean not null default true,
  website_url      text check (website_url is null or (char_length(website_url) <= 300 and website_url ~ '^https://')),
  alert_threshold  smallint check (alert_threshold is null or alert_threshold between 0 and 10),
  alert_emails     text[] not null default '{}' check (cardinality(alert_emails) <= 10),
  status           text not null default 'active' check (status in ('active','paused','archived')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index surveys_account_idx on public.surveys(account_id);

create table public.responses (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  survey_id         uuid not null references public.surveys(id) on delete cascade,
  -- rating is set only once a real browser confirms the click; pending_rating holds the click until then.
  rating            smallint check (rating between 0 and 10),
  pending_rating    smallint check (pending_rating between 0 and 10),
  status            text not null default 'pending' check (status in ('pending','confirmed')),
  comment           text check (char_length(comment) <= 2000),
  respondent_email  text check (char_length(respondent_email) <= 254),
  agent             text check (char_length(agent) <= 100),
  ticket_ref        text check (char_length(ticket_ref) <= 100),
  -- true only when the metadata itself was covered by our signature (API sends).
  metadata_verified boolean not null default false,
  dedupe_key        text not null check (char_length(dedupe_key) = 64),
  ip_hash           text check (char_length(ip_hash) = 64),
  user_agent        text check (char_length(user_agent) <= 300),
  credited          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  unique (survey_id, dedupe_key)
);
create index responses_account_created_idx on public.responses(account_id, created_at desc);
create index responses_survey_created_idx on public.responses(survey_id, created_at desc);

create table public.alerts_log (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  response_id uuid references public.responses(id) on delete set null,
  channel     text not null check (channel in ('email')),
  recipient   text not null,
  status      text not null check (status in ('sent','failed','skipped')),
  created_at  timestamptz not null default now()
);
create index alerts_log_account_idx on public.alerts_log(account_id, created_at desc);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  account_id  uuid references public.accounts(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null check (char_length(action) <= 60),
  target_type text check (char_length(target_type) <= 40),
  target_id   text check (char_length(target_id) <= 80),
  metadata    jsonb not null default '{}'::jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index audit_log_account_idx on public.audit_log(account_id, created_at desc);

create table private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

-------------------------------------------------------------------------------
-- Helper functions used by policies (SECURITY DEFINER, fixed search_path)
-------------------------------------------------------------------------------

create or replace function public.is_member(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = p_account and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_account uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = p_account and m.user_id = auth.uid() and m.role = any(p_roles)
  );
$$;

create or replace function public.rating_max(p_icon_set text)
returns smallint language sql immutable set search_path = '' as $$
  select case p_icon_set
    when 'thumbs' then 2 when 'faces3' then 3 when 'faces5' then 5
    when 'stars5' then 5 when 'nps' then 10 end::smallint;
$$;

create or replace function public.rating_min(p_icon_set text)
returns smallint language sql immutable set search_path = '' as $$
  select case p_icon_set when 'nps' then 0 else 1 end::smallint;
$$;

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger accounts_touch before update on public.accounts
  for each row execute function private.touch_updated_at();
create trigger surveys_touch before update on public.surveys
  for each row execute function private.touch_updated_at();
create trigger responses_touch before update on public.responses
  for each row execute function private.touch_updated_at();

-- A rating must fit the survey's scale, and the response must belong to the survey's account.
create or replace function private.check_response()
returns trigger language plpgsql set search_path = '' as $$
declare v_set text; v_account uuid;
begin
  select icon_set, account_id into v_set, v_account from public.surveys where id = new.survey_id;
  if v_set is null then raise exception 'survey not found'; end if;
  if new.account_id <> v_account then raise exception 'account mismatch'; end if;
  if new.rating is not null and (new.rating < public.rating_min(v_set) or new.rating > public.rating_max(v_set)) then
    raise exception 'rating out of range';
  end if;
  if new.pending_rating is not null and (new.pending_rating < public.rating_min(v_set) or new.pending_rating > public.rating_max(v_set)) then
    raise exception 'rating out of range';
  end if;
  return new;
end $$;

create trigger responses_check before insert or update on public.responses
  for each row execute function private.check_response();

-- Changing a survey's scale would make existing ratings meaningless.
create or replace function private.lock_icon_set()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.icon_set <> old.icon_set and exists (select 1 from public.responses where survey_id = old.id) then
    raise exception 'icon_set cannot change after responses exist';
  end if;
  if new.account_id <> old.account_id then
    raise exception 'account_id cannot change';
  end if;
  return new;
end $$;

create trigger surveys_lock before update on public.surveys
  for each row execute function private.lock_icon_set();

-- New user -> new account, with that user as owner.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'account_name', '')), 80);
  if v_name = '' then v_name := 'My business'; end if;
  insert into public.accounts (name) values (v_name) returning id into v_account;
  insert into public.memberships (account_id, user_id, role) values (v_account, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-------------------------------------------------------------------------------
-- Server-only functions (service role). Atomic operations for the public flow.
-------------------------------------------------------------------------------

-- Fixed-window rate limiter. Returns true if the request is allowed.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  if p_key is null or char_length(p_key) > 200 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- Delete stale rate-limit rows. Schedule daily (pg_cron) or call from a cron job.
create or replace function public.rate_limit_cleanup()
returns integer language sql security definer set search_path = '' as $$
  with d as (delete from private.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from d;
$$;

-- Record a click as pending. Re-clicks with the same dedupe key update the pending rating
-- instead of adding rows, so a scanner or an impatient customer cannot stuff results.
create or replace function public.record_click(
  p_survey uuid, p_rating smallint, p_dedupe_key text,
  p_email text, p_agent text, p_ticket text, p_verified boolean,
  p_ip_hash text, p_user_agent text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_status text; v_balance integer; v_id uuid;
begin
  select s.account_id, s.status, a.credit_balance into v_account, v_status, v_balance
  from public.surveys s join public.accounts a on a.id = s.account_id
  where s.id = p_survey;

  if v_account is null or v_status <> 'active' or v_balance <= 0 then
    return null;  -- caller shows a neutral "survey closed" page
  end if;

  insert into public.responses as r (
    account_id, survey_id, pending_rating, status, respondent_email, agent, ticket_ref,
    metadata_verified, dedupe_key, ip_hash, user_agent
  ) values (
    v_account, p_survey, p_rating, 'pending', p_email, p_agent, p_ticket,
    coalesce(p_verified, false), p_dedupe_key, p_ip_hash, left(p_user_agent, 300)
  )
  on conflict (survey_id, dedupe_key) do update set
    pending_rating = excluded.pending_rating,
    ip_hash = excluded.ip_hash,
    user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end $$;

-- Confirm a pending click once a real browser has loaded the thank-you page.
-- Consumes one credit the first time a response is confirmed.
create or replace function public.confirm_response(p_response uuid)
returns table (result text, account_id uuid, survey_id uuid, rating smallint, rating_changed boolean)
language plpgsql security definer set search_path = '' as $$
declare r record; v_ok boolean; v_old smallint;
begin
  select * into r from public.responses where id = p_response for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid, null::smallint, false; return;
  end if;
  if r.pending_rating is null then
    return query select 'already'::text, r.account_id, r.survey_id, r.rating, false; return;
  end if;

  if not r.credited then
    update public.accounts set credit_balance = credit_balance - 1
      where id = r.account_id and credit_balance > 0;
    v_ok := found;
    if not v_ok then
      return query select 'no_credit'::text, r.account_id, r.survey_id, r.rating, false; return;
    end if;
  end if;

  v_old := r.rating;
  update public.responses set
    rating = r.pending_rating, pending_rating = null, status = 'confirmed',
    credited = true, confirmed_at = coalesce(r.confirmed_at, now())
  where id = p_response;

  return query select 'confirmed'::text, r.account_id, r.survey_id, r.pending_rating,
    (v_old is distinct from r.pending_rating);
end $$;

-- Lock down server-only functions.
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_cleanup() from public, anon, authenticated;
revoke all on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.confirm_response(uuid) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_cleanup() to service_role;
grant execute on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text) to service_role;
grant execute on function public.confirm_response(uuid) to service_role;
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, text[]) to authenticated, service_role;

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------

alter table public.accounts    enable row level security;
alter table public.memberships enable row level security;
alter table public.surveys     enable row level security;
alter table public.responses   enable row level security;
alter table public.alerts_log  enable row level security;
alter table public.audit_log   enable row level security;

-- Anonymous visitors get nothing, anywhere.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- accounts: members read; owners may rename. Plan and credits are not user-writable.
grant select on public.accounts to authenticated;
grant update (name) on public.accounts to authenticated;
create policy accounts_select on public.accounts for select to authenticated
  using (public.is_member(id));
create policy accounts_update on public.accounts for update to authenticated
  using (public.has_role(id, array['owner'])) with check (public.has_role(id, array['owner']));

-- memberships: members can see who else is in their account. Changes are server-side only.
grant select on public.memberships to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(account_id));

-- surveys: members read; owners/admins create, edit, delete.
grant select, insert, delete on public.surveys to authenticated;
grant update (name, question, icon_set, brand_color, thank_you_message, allow_comment,
              website_url, alert_threshold, alert_emails, status) on public.surveys to authenticated;
create policy surveys_select on public.surveys for select to authenticated
  using (public.is_member(account_id));
create policy surveys_insert on public.surveys for insert to authenticated
  with check (public.has_role(account_id, array['owner','admin']) and created_by = auth.uid());
create policy surveys_update on public.surveys for update to authenticated
  using (public.has_role(account_id, array['owner','admin']))
  with check (public.has_role(account_id, array['owner','admin']));
create policy surveys_delete on public.surveys for delete to authenticated
  using (public.has_role(account_id, array['owner','admin']));

-- responses: members read only. Writes happen only through record_click / confirm_response
-- and the server's comment route (service role).
grant select on public.responses to authenticated;
create policy responses_select on public.responses for select to authenticated
  using (public.is_member(account_id));

-- alerts_log and audit_log: owners/admins read only.
grant select on public.alerts_log to authenticated;
create policy alerts_log_select on public.alerts_log for select to authenticated
  using (public.has_role(account_id, array['owner','admin']));
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_role(account_id, array['owner','admin']));

-- Make sure future tables/functions don't silently become public.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
