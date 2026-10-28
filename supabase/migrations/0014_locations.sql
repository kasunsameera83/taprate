-- 0014: branches and locations.
--   * A business lists its branches (shops, counters, clinics). Ratings can carry the branch they came from.
--   * The branch is set only by the server: from a signed QR/share link, a kiosk, or an API link. A
--     customer can't move their rating to another branch, and a branch from another business is refused.
--   * Archiving a branch keeps its old ratings; it just stops new ones being tagged with it.

create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]<>]'),
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists locations_account_idx on public.locations (account_id, created_at);
create unique index if not exists locations_name_unique on public.locations (account_id, lower(name)) where archived_at is null;

alter table public.locations enable row level security;
revoke all on public.locations from anon, authenticated;
grant select on public.locations to authenticated;
grant select, insert, update, delete on public.locations to service_role;
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated using (public.is_member(account_id));
drop policy if exists locations_mfa on public.locations;
create policy locations_mfa on public.locations as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

alter table public.responses add column if not exists location_id uuid references public.locations(id) on delete set null;
create index if not exists responses_location_idx on public.responses (account_id, location_id, created_at desc) where location_id is not null;

alter table public.kiosks add column if not exists location_id uuid references public.locations(id) on delete set null;
grant select (location_id) on public.kiosks to authenticated;

-- A rating's branch must belong to the same business.
create or replace function private.check_response_location()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.location_id is not null and not exists (select 1 from public.locations l where l.id = new.location_id and l.account_id = new.account_id) then
    raise exception 'invalid location' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists responses_location_check on public.responses;
create trigger responses_location_check before insert or update of location_id on public.responses
  for each row execute function private.check_response_location();

-------------------------------------------------------------------------------
-- Managing branches (owners and admins)
-------------------------------------------------------------------------------

create or replace function public.create_location(p_account uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]<>]' then raise exception 'invalid location name' using errcode = '22023'; end if;
  if (select count(*) from public.locations where account_id = p_account and archived_at is null) >= 200 then
    raise exception 'too many locations' using errcode = '54000';
  end if;
  insert into public.locations (account_id, name, created_by) values (p_account, v_name, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.update_location(p_location uuid, p_name text, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  select account_id into v_account from public.locations where id = p_location;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]<>]' then raise exception 'invalid location name' using errcode = '22023'; end if;
  update public.locations
     set name = v_name,
         archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_location;
end $$;

-------------------------------------------------------------------------------
-- Clicks and kiosks now carry the branch
-------------------------------------------------------------------------------

-- Checked branch: belongs to the survey's business and isn't archived. Anything else is quietly dropped.
create or replace function private.valid_location(p_account uuid, p_location uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select l.id from public.locations l where l.id = p_location and l.account_id = p_account and l.archived_at is null;
$$;

drop function if exists public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text);

create or replace function public.record_click(
  p_survey uuid, p_rating smallint, p_dedupe_key text,
  p_email text, p_agent text, p_ticket text, p_verified boolean,
  p_ip_hash text, p_user_agent text, p_channel text default 'email', p_location uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_status text; v_balance integer; v_suspended timestamptz; v_id uuid; v_location uuid;
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

  insert into public.responses as r (
    account_id, survey_id, pending_rating, status, respondent_email, agent, ticket_ref,
    metadata_verified, dedupe_key, ip_hash, user_agent, channel, location_id
  ) values (
    v_account, p_survey, p_rating, 'pending', p_email, p_agent, p_ticket,
    coalesce(p_verified, false), p_dedupe_key, p_ip_hash, left(p_user_agent, 300), p_channel, v_location
  )
  on conflict (survey_id, dedupe_key) do update set
    pending_rating = excluded.pending_rating,
    ip_hash = excluded.ip_hash,
    user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_click(uuid, smallint, text, text, text, text, boolean, text, text, text, uuid) to service_role;

drop function if exists public.create_kiosk(uuid, uuid, text, text);

create or replace function public.create_kiosk(p_account uuid, p_survey uuid, p_name text, p_token_hash text, p_location uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if not exists (select 1 from public.surveys where id = p_survey and account_id = p_account) then perform private.forbid('not found'); end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid name' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token' using errcode = '22023'; end if;
  if p_location is not null and private.valid_location(p_account, p_location) is null then raise exception 'invalid location' using errcode = '22023'; end if;
  if (select count(*) from public.kiosks where account_id = p_account and revoked_at is null) >= 50 then
    raise exception 'too many kiosks' using errcode = '54000';
  end if;
  insert into public.kiosks (account_id, survey_id, name, token_hash, created_by, location_id)
    values (p_account, p_survey, v_name, p_token_hash, auth.uid(), p_location) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_kiosk(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.create_kiosk(uuid, uuid, text, text, uuid) to authenticated;

create or replace function public.record_kiosk_rating(p_kiosk uuid, p_token_hash text, p_rating smallint, p_ip_hash text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.kiosks; v_status text; v_id uuid;
begin
  select * into k from public.kiosks where id = p_kiosk for update;
  if not found or k.revoked_at is not null or k.token_hash <> p_token_hash then return null; end if;
  select status into v_status from public.surveys where id = k.survey_id;
  if v_status is distinct from 'active' then return null; end if;
  if exists (select 1 from public.accounts where id = k.account_id and suspended_at is not null) then return null; end if;

  update public.accounts set credit_balance = credit_balance - 1 where id = k.account_id and credit_balance > 0;
  if not found then return null; end if;

  insert into public.responses (account_id, survey_id, rating, status, dedupe_key, ip_hash, user_agent, channel, credited, confirmed_at, location_id)
    values (k.account_id, k.survey_id, p_rating, 'confirmed', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            p_ip_hash, left(p_user_agent, 300), 'kiosk', true, now(), private.valid_location(k.account_id, k.location_id))
    returning id into v_id;
  update public.kiosks set last_used_at = now() where id = p_kiosk;
  return v_id;
end $$;

revoke all on function private.valid_location(uuid, uuid) from public;
revoke all on function public.create_location(uuid, text) from public, anon;
grant execute on function public.create_location(uuid, text) to authenticated;
revoke all on function public.update_location(uuid, text, boolean) from public, anon;
grant execute on function public.update_location(uuid, text, boolean) to authenticated;
