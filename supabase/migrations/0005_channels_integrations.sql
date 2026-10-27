-- 0005: more ways to collect feedback, and send it to other tools.
--   * channel on each response (email, QR, WhatsApp, SMS, link, website widget, kiosk)
--   * tablet kiosks: a secret link per kiosk (only a hash stored), revocable
--   * integrations: Slack, Microsoft Teams, signed webhooks (URLs stored encrypted by the server)

-------------------------------------------------------------------------------
-- Channel
-------------------------------------------------------------------------------

alter table public.responses
  add column if not exists channel text not null default 'email'
  check (channel in ('email', 'qr', 'whatsapp', 'sms', 'link', 'web', 'kiosk'));

drop function if exists public.record_click(uuid, smallint, text, text, text, text, boolean, text, text);

create or replace function public.record_click(
  p_survey uuid, p_rating smallint, p_dedupe_key text,
  p_email text, p_agent text, p_ticket text, p_verified boolean,
  p_ip_hash text, p_user_agent text, p_channel text default 'email'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_status text; v_balance integer; v_id uuid;
begin
  if p_channel not in ('email', 'qr', 'whatsapp', 'sms', 'link', 'web') then
    raise exception 'invalid channel';
  end if;
  select s.account_id, s.status, a.credit_balance into v_account, v_status, v_balance
  from public.surveys s join public.accounts a on a.id = s.account_id
  where s.id = p_survey;

  if v_account is null or v_status <> 'active' or v_balance <= 0 then
    return null;
  end if;

  insert into public.responses as r (
    account_id, survey_id, pending_rating, status, respondent_email, agent, ticket_ref,
    metadata_verified, dedupe_key, ip_hash, user_agent, channel
  ) values (
    v_account, p_survey, p_rating, 'pending', p_email, p_agent, p_ticket,
    coalesce(p_verified, false), p_dedupe_key, p_ip_hash, left(p_user_agent, 300), p_channel
  )
  on conflict (survey_id, dedupe_key) do update set
    pending_rating = excluded.pending_rating,
    ip_hash = excluded.ip_hash,
    user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text) to service_role;

-------------------------------------------------------------------------------
-- Kiosks
-------------------------------------------------------------------------------

create table if not exists public.kiosks (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  token_hash   text not null check (char_length(token_hash) = 64),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);
create index if not exists kiosks_account_idx on public.kiosks (account_id, created_at desc);

alter table public.kiosks enable row level security;
revoke all on public.kiosks from anon, authenticated;
-- token_hash is never selectable by users.
grant select (id, account_id, survey_id, name, created_by, created_at, revoked_at, last_used_at) on public.kiosks to authenticated;
grant select, insert, update, delete on public.kiosks to service_role;
create policy kiosks_select on public.kiosks for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));
create policy kiosks_mfa on public.kiosks as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

create or replace function public.create_kiosk(p_account uuid, p_survey uuid, p_name text, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if not exists (select 1 from public.surveys where id = p_survey and account_id = p_account) then perform private.forbid('not found'); end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid name' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token' using errcode = '22023'; end if;
  if (select count(*) from public.kiosks where account_id = p_account and revoked_at is null) >= 50 then
    raise exception 'too many kiosks' using errcode = '54000';
  end if;
  insert into public.kiosks (account_id, survey_id, name, token_hash, created_by)
    values (p_account, p_survey, v_name, p_token_hash, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_kiosk(p_kiosk uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  select account_id into v_account from public.kiosks where id = p_kiosk;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  update public.kiosks set revoked_at = coalesce(revoked_at, now()) where id = p_kiosk;
end $$;

-- Server-only: record one kiosk tap as a confirmed rating (each tap is its own response).
create or replace function public.record_kiosk_rating(p_kiosk uuid, p_token_hash text, p_rating smallint, p_ip_hash text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.kiosks; v_status text; v_id uuid;
begin
  select * into k from public.kiosks where id = p_kiosk for update;
  if not found or k.revoked_at is not null or k.token_hash <> p_token_hash then return null; end if;
  select status into v_status from public.surveys where id = k.survey_id;
  if v_status is distinct from 'active' then return null; end if;

  update public.accounts set credit_balance = credit_balance - 1 where id = k.account_id and credit_balance > 0;
  if not found then return null; end if;

  insert into public.responses (account_id, survey_id, rating, status, dedupe_key, ip_hash, user_agent, channel, credited, confirmed_at)
    values (k.account_id, k.survey_id, p_rating, 'confirmed', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_ip_hash, left(p_user_agent, 300), 'kiosk', true, now())
    returning id into v_id;
  update public.kiosks set last_used_at = now() where id = p_kiosk;
  return v_id;
end $$;

revoke all on function public.create_kiosk(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_kiosk(uuid, uuid, text, text) to authenticated;
revoke all on function public.revoke_kiosk(uuid) from public, anon;
grant execute on function public.revoke_kiosk(uuid) to authenticated;
revoke all on function public.record_kiosk_rating(uuid, text, smallint, text, text) from public, anon, authenticated;
grant execute on function public.record_kiosk_rating(uuid, text, smallint, text, text) to service_role;

-------------------------------------------------------------------------------
-- Integrations (written only by the server after its own permission checks)
-------------------------------------------------------------------------------

create table if not exists public.integrations (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts(id) on delete cascade,
  kind             text not null check (kind in ('slack', 'teams', 'webhook')),
  name             text not null check (char_length(name) between 1 and 60),
  url_encrypted    text not null check (char_length(url_encrypted) <= 2000),
  url_hint         text not null check (char_length(url_hint) <= 120),
  secret_encrypted text check (char_length(secret_encrypted) <= 500),
  events           text[] not null default '{negative}' check (events <@ array['negative', 'all']::text[] and cardinality(events) between 1 and 2),
  enabled          boolean not null default true,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  last_status      text check (last_status in ('ok', 'failed')),
  last_delivery_at timestamptz
);
create index if not exists integrations_account_idx on public.integrations (account_id);

alter table public.integrations enable row level security;
revoke all on public.integrations from anon, authenticated;
-- Encrypted URL and secret are never selectable by users.
grant select (id, account_id, kind, name, url_hint, events, enabled, created_at, last_status, last_delivery_at) on public.integrations to authenticated;
grant select, insert, update, delete on public.integrations to service_role;
create policy integrations_select on public.integrations for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));
create policy integrations_mfa on public.integrations as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

create table if not exists public.integration_deliveries (
  id             bigint generated always as identity primary key,
  account_id     uuid not null references public.accounts(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  event          text not null check (char_length(event) <= 40),
  status         text not null check (status in ('ok', 'failed', 'blocked')),
  http_status    integer,
  created_at     timestamptz not null default now()
);
create index if not exists integration_deliveries_idx on public.integration_deliveries (integration_id, created_at desc);

alter table public.integration_deliveries enable row level security;
revoke all on public.integration_deliveries from anon, authenticated;
grant select on public.integration_deliveries to authenticated;
grant select, insert, delete on public.integration_deliveries to service_role;
grant usage, select on all sequences in schema public to service_role;
create policy integration_deliveries_select on public.integration_deliveries for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));
create policy integration_deliveries_mfa on public.integration_deliveries as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());
