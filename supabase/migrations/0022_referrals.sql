-- 0022: referral programme. A business shares its link; when a business that signed up through it makes
-- its first payment, both get bonus responses. Rewards only follow real payments, never just sign-ups.

alter table public.accounts add column if not exists referral_code text unique check (referral_code is null or referral_code ~ '^[A-Z2-9]{8}$');
-- No user grant: the code is made by the function below.

create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_account uuid not null references public.accounts(id) on delete cascade,
  referred_account uuid not null unique references public.accounts(id) on delete cascade,
  created_at       timestamptz not null default now(),
  rewarded_at      timestamptz,
  check (referrer_account <> referred_account)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_account, created_at desc);
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;
grant select (id, referrer_account, created_at, rewarded_at) on public.referrals to authenticated;
grant select, insert, update, delete on public.referrals to service_role;
drop policy if exists referrals_select on public.referrals;
-- The referring business sees how many joined (not who).
create policy referrals_select on public.referrals for select to authenticated using (public.has_role(referrer_account, array['owner', 'admin']));
drop policy if exists referrals_mfa on public.referrals;
create policy referrals_mfa on public.referrals as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

-- The business's code (made the first time it's asked for). Owners and admins.
create or replace function public.referral_code(p_account uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i integer; tries integer := 0; b bytea;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  select referral_code into v from public.accounts where id = p_account;
  while v is null and tries < 10 loop
    v := ''; b := uuid_send(gen_random_uuid());
    for i in 0..7 loop v := v || substr(alphabet, 1 + (get_byte(b, i) % 32), 1); end loop;
    begin
      update public.accounts set referral_code = v where id = p_account and referral_code is null;
    exception when unique_violation then v := null; end;
    tries := tries + 1;
  end loop;
  return v;
end $$;

-- Server only, right after sign-up: links the new person's new business to the referrer.
-- Refused for your own businesses (same owner on both sides).
create or replace function public.attach_referral(p_user uuid, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_referrer uuid; v_new uuid;
begin
  if p_code !~ '^[A-Z2-9]{8}$' then return false; end if;
  select id into v_referrer from public.accounts where referral_code = p_code;
  if v_referrer is null then return false; end if;
  select a.id into v_new from public.accounts a join public.memberships m on m.account_id = a.id and m.user_id = p_user and m.role = 'owner'
   where a.created_at > now() - interval '1 hour' order by a.created_at desc limit 1;
  if v_new is null or v_new = v_referrer then return false; end if;
  if exists (select 1 from public.memberships m where m.account_id = v_referrer and m.user_id = p_user) then return false; end if;
  insert into public.referrals (referrer_account, referred_account) values (v_referrer, v_new) on conflict do nothing;
  return found;
end $$;

-- Server only, after a payment is recorded: bonus responses for both businesses, once, if the referred
-- business has really paid. At most 50 rewards a year per referrer.
create or replace function public.reward_referral(p_account uuid, p_bonus integer default 250)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.referrals; v_bal integer;
begin
  select * into r from public.referrals where referred_account = p_account and rewarded_at is null for update;
  if not found then return false; end if;
  if not exists (select 1 from public.billing_payments p where p.account_id = p_account and p.status = 'paid') then return false; end if;
  if (select count(*) from public.referrals where referrer_account = r.referrer_account and rewarded_at > now() - interval '365 days') >= 50 then return false; end if;
  update public.referrals set rewarded_at = now() where id = r.id;
  update public.accounts set credit_balance = credit_balance + p_bonus where id = r.referred_account returning credit_balance into v_bal;
  insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (r.referred_account, null, p_bonus, 'Referral bonus: joined through a friend', v_bal);
  update public.accounts set credit_balance = credit_balance + p_bonus where id = r.referrer_account returning credit_balance into v_bal;
  insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (r.referrer_account, null, p_bonus, 'Referral bonus: a business you invited joined', v_bal);
  return true;
end $$;

revoke all on function public.referral_code(uuid) from public, anon;
grant execute on function public.referral_code(uuid) to authenticated;
revoke all on function public.attach_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_referral(uuid, text) to service_role;
revoke all on function public.reward_referral(uuid, integer) from public, anon, authenticated;
grant execute on function public.reward_referral(uuid, integer) to service_role;
