-- 0003: team members & invites, agent role, two-factor enforcement, privacy tools.
--
-- Security model additions:
--   * All team changes go through SECURITY DEFINER functions that enforce the rules in the database
--     itself (who may invite whom, last owner can't be removed, ...). Users still have no direct
--     write access to memberships or invites.
--   * Agents only ever see responses where the agent name matches theirs (row level security).
--   * Two-factor: once a user has a verified authenticator, every table refuses their requests unless
--     the session has completed the second step (aal2). Enforced by restrictive RLS policies.

-------------------------------------------------------------------------------
-- Roles: add "agent" (+ the agent name that responses are matched against)
-------------------------------------------------------------------------------

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('owner', 'admin', 'viewer', 'agent'));
alter table public.memberships
  add column if not exists agent_name text check (agent_name is null or char_length(agent_name) between 1 and 100);
alter table public.memberships drop constraint if exists memberships_agent_name_required;
alter table public.memberships
  add constraint memberships_agent_name_required check (role <> 'agent' or agent_name is not null);

-------------------------------------------------------------------------------
-- Two-factor helper
-------------------------------------------------------------------------------

-- True when the current session is allowed to touch data: either the user has no verified
-- authenticator, or this session completed the second step (JWT claim aal = aal2).
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated, service_role;

-------------------------------------------------------------------------------
-- Invites
-------------------------------------------------------------------------------

create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  email        text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  role         text not null check (role in ('admin', 'viewer', 'agent')),
  agent_name   text check (agent_name is null or char_length(agent_name) between 1 and 100),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'declined')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  check (role <> 'agent' or agent_name is not null)
);
create unique index if not exists invites_one_pending_per_email
  on public.invites (account_id, email) where status = 'pending';
create index if not exists invites_email_idx on public.invites (email) where status = 'pending';

alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;
create policy invites_select on public.invites for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));

-------------------------------------------------------------------------------
-- Agent-scoped response visibility
-------------------------------------------------------------------------------

create or replace function public.can_read_response(p_account uuid, p_agent text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.account_id = p_account
      and m.user_id = auth.uid()
      and (
        m.role <> 'agent'
        or (p_agent is not null and lower(p_agent) = lower(m.agent_name))
      )
  );
$$;
revoke all on function public.can_read_response(uuid, text) from public, anon;
grant execute on function public.can_read_response(uuid, text) to authenticated, service_role;

drop policy if exists responses_select on public.responses;
create policy responses_select on public.responses for select to authenticated
  using (public.can_read_response(account_id, agent));

-------------------------------------------------------------------------------
-- Two-factor enforcement on every table (restrictive = AND-ed with the policies above)
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['accounts', 'memberships', 'surveys', 'responses', 'alerts_log', 'audit_log', 'invites'] loop
    execute format('drop policy if exists %I on public.%I', t || '_mfa', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())',
      t || '_mfa', t
    );
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Internal helpers
-------------------------------------------------------------------------------

create or replace function private.role_in(p_account uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.memberships where account_id = p_account and user_id = p_user;
$$;

create or replace function private.forbid(p_message text default 'forbidden')
returns void language plpgsql set search_path = '' as $$
begin
  raise exception '%', p_message using errcode = '42501';
end $$;

create or replace function private.owner_count(p_account uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.memberships where account_id = p_account and role = 'owner';
$$;

-------------------------------------------------------------------------------
-- Team functions (called by signed-in users through the API)
-------------------------------------------------------------------------------

-- Members with their emails. Owners and admins only.
create or replace function public.account_members(p_account uuid)
returns table (user_id uuid, email text, role text, agent_name text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then
    perform private.forbid();
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.agent_name, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.account_id = p_account
    order by m.created_at;
end $$;

create or replace function public.create_invite(p_account uuid, p_email text, p_role text, p_agent_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.role_in(p_account, auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_agent text := nullif(btrim(coalesce(p_agent_name, '')), '');
  v_id uuid;
begin
  if not public.mfa_ok() or coalesce(v_actor, '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if p_role not in ('admin', 'viewer', 'agent') then raise exception 'invalid role' using errcode = '22023'; end if;
  if p_role = 'admin' and v_actor <> 'owner' then perform private.forbid('only owners can invite admins'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if p_role = 'agent' and (v_agent is null or char_length(v_agent) > 100) then
    raise exception 'agent name required' using errcode = '22023';
  end if;
  if p_role <> 'agent' then v_agent := null; end if;

  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.account_id = p_account and lower(u.email) = v_email
  ) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if (select count(*) from public.invites where account_id = p_account and status = 'pending') >= 50 then
    raise exception 'too many pending invites' using errcode = '54000';
  end if;

  update public.invites set status = 'revoked', responded_at = now()
    where account_id = p_account and email = v_email and status = 'pending';
  insert into public.invites (account_id, email, role, agent_name, invited_by)
    values (p_account, v_email, p_role, v_agent, auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites; v_actor text;
begin
  select * into v_inv from public.invites where id = p_invite for update;
  if not found then perform private.forbid('not found'); end if;
  v_actor := private.role_in(v_inv.account_id, auth.uid());
  if not public.mfa_ok() or coalesce(v_actor, '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if v_inv.role = 'admin' and v_actor <> 'owner' then perform private.forbid(); end if;
  update public.invites set status = 'revoked', responded_at = now() where id = p_invite and status = 'pending';
end $$;

-- Pending invites addressed to the signed-in user's CONFIRMED email.
create or replace function public.my_invites()
returns table (id uuid, account_id uuid, account_name text, role text, agent_name text, invited_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.account_id, a.name, i.role, i.agent_name, i.created_at, i.expires_at
  from public.invites i
  join public.accounts a on a.id = i.account_id
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null
    and i.email = lower(u.email)
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$$;

create or replace function private.invite_for_me(p_invite uuid)
returns public.invites language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites; v_email text; v_confirmed timestamptz;
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = auth.uid();
  select * into v_inv from public.invites where id = p_invite for update;
  if not found or v_confirmed is null or v_inv.email <> v_email then perform private.forbid('invite not found'); end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invite is no longer valid' using errcode = '22023';
  end if;
  return v_inv;
end $$;

create or replace function public.accept_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  v_inv := private.invite_for_me(p_invite);
  insert into public.memberships (account_id, user_id, role, agent_name)
    values (v_inv.account_id, auth.uid(), v_inv.role, v_inv.agent_name)
    on conflict (account_id, user_id) do nothing;
  update public.invites set status = 'accepted', responded_at = now() where id = p_invite;
  return v_inv.account_id;
end $$;

create or replace function public.decline_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites;
begin
  v_inv := private.invite_for_me(p_invite);
  update public.invites set status = 'declined', responded_at = now() where id = v_inv.id;
end $$;

create or replace function public.update_member(p_account uuid, p_user uuid, p_role text, p_agent_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.role_in(p_account, auth.uid());
  v_target text := private.role_in(p_account, p_user);
  v_agent text := nullif(btrim(coalesce(p_agent_name, '')), '');
begin
  if not public.mfa_ok() or coalesce(v_actor, '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if v_target is null then perform private.forbid('not found'); end if;
  if p_role not in ('owner', 'admin', 'viewer', 'agent') then raise exception 'invalid role' using errcode = '22023'; end if;
  -- Admins manage only viewers and agents.
  if v_actor = 'admin' and (v_target not in ('viewer', 'agent') or p_role not in ('viewer', 'agent')) then
    perform private.forbid();
  end if;
  -- Never leave an account without an owner.
  if v_target = 'owner' and p_role <> 'owner' and private.owner_count(p_account) <= 1 then
    raise exception 'an account needs at least one owner' using errcode = '22023';
  end if;
  if p_role = 'agent' and (v_agent is null or char_length(v_agent) > 100) then
    raise exception 'agent name required' using errcode = '22023';
  end if;
  update public.memberships
    set role = p_role, agent_name = case when p_role = 'agent' then v_agent else null end
    where account_id = p_account and user_id = p_user;
end $$;

-- Remove someone (owners/admins), or leave an account yourself.
create or replace function public.remove_member(p_account uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.role_in(p_account, auth.uid());
  v_target text := private.role_in(p_account, p_user);
begin
  if v_actor is null or not public.mfa_ok() then perform private.forbid(); end if;
  if v_target is null then perform private.forbid('not found'); end if;
  if p_user <> auth.uid() then
    if v_actor not in ('owner', 'admin') then perform private.forbid(); end if;
    if v_actor = 'admin' and v_target not in ('viewer', 'agent') then perform private.forbid(); end if;
  end if;
  if v_target = 'owner' and private.owner_count(p_account) <= 1 then
    raise exception 'an account needs at least one owner' using errcode = '22023';
  end if;
  delete from public.memberships where account_id = p_account and user_id = p_user;
end $$;

-- A user without a business account (e.g. joined via invite) can create one. One owned account each.
create or replace function public.create_account(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := left(btrim(coalesce(p_name, '')), 80); v_id uuid;
begin
  if auth.uid() is null then perform private.forbid(); end if;
  if v_name = '' then raise exception 'name required' using errcode = '22023'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid() and role = 'owner') then
    raise exception 'you already own an account' using errcode = '23505';
  end if;
  insert into public.accounts (name) values (v_name) returning id into v_id;
  insert into public.memberships (account_id, user_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-------------------------------------------------------------------------------
-- Privacy tools (PDPA / GDPR): erase one customer's data, delete the whole account
-------------------------------------------------------------------------------

create or replace function public.erase_customer_data(p_account uuid, p_email text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then
    perform private.forbid();
  end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'email required' using errcode = '22023'; end if;
  with d as (
    delete from public.responses
    where account_id = p_account and lower(respondent_email) = lower(btrim(p_email))
    returning 1
  )
  select count(*)::integer into v_count from d;
  return v_count;
end $$;

create or replace function public.delete_account(p_account uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') <> 'owner' then
    perform private.forbid();
  end if;
  delete from public.accounts where id = p_account; -- cascades to surveys, responses, members, invites, logs
end $$;

-------------------------------------------------------------------------------
-- Sign-up: someone who was invited joins that business instead of getting an empty account
-------------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_name text;
begin
  if exists (
    select 1 from public.invites
    where email = lower(new.email) and status = 'pending' and expires_at > now()
  ) then
    return new; -- they accept the invite after confirming their email
  end if;
  v_name := left(btrim(coalesce(new.raw_user_meta_data->>'account_name', '')), 80);
  if v_name = '' then v_name := 'My business'; end if;
  insert into public.accounts (name) values (v_name) returning id into v_account;
  insert into public.memberships (account_id, user_id, role) values (v_account, new.id, 'owner');
  return new;
end $$;

-------------------------------------------------------------------------------
-- Grants: signed-in users only
-------------------------------------------------------------------------------

do $$
declare f text;
begin
  foreach f in array array[
    'public.account_members(uuid)',
    'public.create_invite(uuid, text, text, text)',
    'public.revoke_invite(uuid)',
    'public.my_invites()',
    'public.accept_invite(uuid)',
    'public.decline_invite(uuid)',
    'public.update_member(uuid, uuid, text, text)',
    'public.remove_member(uuid, uuid)',
    'public.create_account(text)',
    'public.erase_customer_data(uuid, text)',
    'public.delete_account(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
