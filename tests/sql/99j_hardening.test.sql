-- Hardening (0025): referral bonus needs a plan payment and is taken back on refund; MFA rule on two more tables.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.expect_fail(p_sql text, p_label text, p_reason text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm !~* p_reason then raise exception 'TEST FAILED: % was blocked for the wrong reason: %', p_label, sqlerrm; end if;
    return;
  end;
  raise exception 'SECURITY TEST FAILED (should have been blocked): %', p_label;
end $$;
create or replace function pg_temp.eq(p_actual bigint, p_expected bigint, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual; end if;
end $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal2')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

create temp table r25 as select
  (select account_id from public.surveys where id = '5d000000-0000-0000-0000-000000000001') as acc_a,
  (select account_id from public.memberships where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' and role = 'owner' limit 1) as acc_b;
grant select on r25 to service_role;
create temp table bal25 as select (select credit_balance from public.accounts where id = (select acc_a from r25)) as a, (select credit_balance from public.accounts where id = (select acc_b from r25)) as b;
select pg_temp.eq((select count(*) from public.referrals where referred_account = (select acc_a from r25) and rewarded_at is not null), 1, 'referral was rewarded earlier');
select pg_temp.eq(case when (select count(*) from public.billing_payments where account_id = (select acc_a from r25) and status = 'paid' and subscription_id is not null) > 0 then 1 else 0 end, 1, 'fixture has plan payments');

-- Refund every plan payment: both bonuses are taken back, once.
update public.billing_payments set status = 'refunded' where account_id = (select acc_a from r25) and status = 'paid' and subscription_id is not null;
select pg_temp.eq((select a from bal25) - (select credit_balance from public.accounts where id = (select acc_a from r25)), least((select a from bal25), 250), 'referred bonus taken back');
select pg_temp.eq((select b from bal25) - (select credit_balance from public.accounts where id = (select acc_b from r25)), least((select b from bal25), 250), 'referrer bonus taken back');
select pg_temp.eq((select count(*) from public.referrals where referred_account = (select acc_a from r25) and reversed_at is not null), 1, 'marked reversed');
select pg_temp.eq((select count(*) from public.credit_adjustments where reason like 'Referral bonus reversed%'), 2, 'both reversals logged');
select pg_temp.eq((select count(*) from public.accounts where credit_balance < 0), 0, 'never below zero');

-- Restored and refunded again: no second clawback.
update public.billing_payments set status = 'paid' where account_id = (select acc_a from r25) and status = 'refunded' and subscription_id is not null;
update public.billing_payments set status = 'refunded' where account_id = (select acc_a from r25) and status = 'paid' and subscription_id is not null;
select pg_temp.eq((select count(*) from public.credit_adjustments where reason like 'Referral bonus reversed%'), 2, 'taken back only once');
update public.billing_payments set status = 'paid' where account_id = (select acc_a from r25) and subscription_id is not null;

-- Already rewarded: calling again gives nothing.
set role service_role;
select pg_temp.eq(public.reward_referral((select acc_a from r25))::int, 0, 'no second reward');
reset role;

select pg_temp.eq((select count(*) from pg_policy where polname in ('credit_adjustments_mfa', 'report_subscriptions_mfa') and not polpermissive), 2, 'mfa rules added');

-- 0026: PayHere in dollars is allowed; Stripe in rupees still isn't.
insert into public.billing_orders (account_id, provider, kind, item, credits, amount_minor, currency) values ((select acc_a from r25), 'payhere', 'topup', 'pack_250', 250, 1200, 'USD');
select pg_temp.expect_fail($q$insert into public.billing_orders (account_id, provider, kind, item, credits, amount_minor, currency) values ((select acc_a from r25), 'stripe', 'topup', 'pack_250', 250, 350000, 'LKR')$q$, 'stripe in rupees', 'check');
delete from public.billing_orders where provider = 'payhere' and currency = 'USD' and amount_minor = 1200 and account_id = (select acc_a from r25);
