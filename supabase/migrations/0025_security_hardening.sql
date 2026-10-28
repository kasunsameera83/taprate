-- 0025: hardening from the security review.
-- 1. Referral bonus only after a PLAN payment (a cheap top-up from a second account can't farm bonuses).
-- 2. If that payment is refunded and no other plan payment remains, both bonuses are taken back.
-- 3. Two owner-readable tables get the same "two-step sign-in finished" rule as everything else.

create or replace function public.reward_referral(p_account uuid, p_bonus integer default 250)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.referrals; v_bal integer;
begin
  select * into r from public.referrals where referred_account = p_account and rewarded_at is null for update;
  if not found then return false; end if;
  if not exists (select 1 from public.billing_payments p where p.account_id = p_account and p.status = 'paid' and p.subscription_id is not null) then return false; end if;
  if (select count(*) from public.referrals where referrer_account = r.referrer_account and rewarded_at > now() - interval '365 days') >= 50 then return false; end if;
  update public.referrals set rewarded_at = now() where id = r.id;
  update public.accounts set credit_balance = credit_balance + p_bonus where id = r.referred_account returning credit_balance into v_bal;
  insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (r.referred_account, null, p_bonus, 'Referral bonus: joined through a friend', v_bal);
  update public.accounts set credit_balance = credit_balance + p_bonus where id = r.referrer_account returning credit_balance into v_bal;
  insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (r.referrer_account, null, p_bonus, 'Referral bonus: a business you invited joined', v_bal);
  return true;
end $$;
revoke all on function public.reward_referral(uuid, integer) from public, anon, authenticated;
grant execute on function public.reward_referral(uuid, integer) to service_role;

alter table public.referrals add column if not exists reversed_at timestamptz;

-- Runs when a payment is marked refunded. Takes back up to the bonus (never below zero), once.
create or replace function private.referral_clawback()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.referrals; v_take integer; v_bal integer; v_acc uuid;
begin
  if new.status <> 'refunded' or old.status = 'refunded' then return new; end if;
  select * into r from public.referrals where referred_account = new.account_id and rewarded_at is not null and reversed_at is null for update;
  if not found then return new; end if;
  if exists (select 1 from public.billing_payments p where p.account_id = new.account_id and p.status = 'paid' and p.subscription_id is not null and p.id <> new.id) then return new; end if;
  update public.referrals set reversed_at = now() where id = r.id;
  foreach v_acc in array array[r.referred_account, r.referrer_account] loop
    select least(credit_balance, 250) into v_take from public.accounts where id = v_acc for update;
    if coalesce(v_take, 0) > 0 then
      update public.accounts set credit_balance = credit_balance - v_take where id = v_acc returning credit_balance into v_bal;
      insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (v_acc, null, -v_take, 'Referral bonus reversed: the payment was refunded', v_bal);
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.referral_clawback() from public, anon, authenticated;
drop trigger if exists billing_payments_referral_clawback on public.billing_payments;
create trigger billing_payments_referral_clawback after update of status on public.billing_payments
  for each row execute function private.referral_clawback();

drop policy if exists credit_adjustments_mfa on public.credit_adjustments;
create policy credit_adjustments_mfa on public.credit_adjustments as restrictive for all to authenticated using (public.mfa_ok() or public.is_platform_admin()) with check (public.mfa_ok() or public.is_platform_admin());
drop policy if exists report_subscriptions_mfa on public.report_subscriptions;
create policy report_subscriptions_mfa on public.report_subscriptions as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
