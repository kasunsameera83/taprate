-- Referrals (0022): codes for owners/admins only; linking and rewards are server-only, need a real payment, and happen once.
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

create temp table r22 as select
  (select account_id from public.surveys where id = '5d000000-0000-0000-0000-000000000001') as acc_a,
  (select account_id from public.memberships where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' and role = 'owner' limit 1) as acc_b;
create temp table code22 (c text);
grant select on r22 to authenticated, service_role;
grant select, insert on code22 to authenticated, service_role;

set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
insert into code22 select public.referral_code((select acc_b from r22));
select pg_temp.eq((select count(*) from code22 where c ~ '^[A-Z2-9]{8}$'), 1, 'code made');
select pg_temp.eq((select count(*) from code22 where c = public.referral_code((select acc_b from r22))), 1, 'same code next time');
select pg_temp.expect_fail($q$select public.referral_code((select acc_a from r22))$q$, 'code for another business', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002');
select pg_temp.expect_fail($q$select public.referral_code((select acc_a from r22))$q$, 'agent gets code', 'forbidden');
select pg_temp.expect_fail($q$select public.attach_referral('dddddddd-0000-0000-0000-000000000001', (select c from code22))$q$, 'user links referral', 'permission denied');
select pg_temp.expect_fail($q$select public.reward_referral((select acc_a from r22))$q$, 'user grants reward', 'permission denied');
select pg_temp.expect_fail($q$insert into public.referrals (referrer_account, referred_account) values ((select acc_b from r22), (select acc_a from r22))$q$, 'user writes referrals', 'permission denied');
select pg_temp.expect_fail($q$update public.accounts set referral_code = 'AAAAAAAA' where id = (select acc_a from r22)$q$, 'user sets own code', 'permission denied');
reset role;

set role service_role;
select pg_temp.eq(public.attach_referral('bbbbbbbb-0000-0000-0000-000000000001', (select c from code22))::int, 0, 'cannot refer yourself');
select pg_temp.eq(public.attach_referral('dddddddd-0000-0000-0000-000000000001', 'BAD')::int, 0, 'bad code ignored');
select pg_temp.eq(public.attach_referral('dddddddd-0000-0000-0000-000000000001', (select c from code22))::int, 1, 'new business linked');
select pg_temp.eq(public.attach_referral('dddddddd-0000-0000-0000-000000000001', (select c from code22))::int, 0, 'linked only once');
reset role;

-- Referrer sees the count, not the other business; the referred business sees nothing.
set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.referrals), 1, 'referrer sees one join');
select pg_temp.expect_fail($q$select referred_account from public.referrals$q$, 'referrer reads who joined', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.referrals), 0, 'referred sees nothing');
reset role;

-- No paid payment: no reward. Then a payment: both get 250, once.
create temp table bal22 as select (select credit_balance from public.accounts where id = (select acc_a from r22)) as a, (select credit_balance from public.accounts where id = (select acc_b from r22)) as b;
grant select on bal22 to service_role;
update public.billing_payments set status = 'refunded' where account_id = (select acc_a from r22) and status = 'paid';
create temp table paid22 as select id from public.billing_payments where account_id = (select acc_a from r22);
set role service_role;
select pg_temp.eq(public.reward_referral((select acc_a from r22))::int, 0, 'no reward without a payment');
reset role;
update public.billing_payments set status = 'paid' where id in (select id from paid22);
select pg_temp.eq(case when (select count(*) from paid22) > 0 then 1 else 0 end, 1, 'fixture has payments');
set role service_role;
select pg_temp.eq(public.reward_referral((select acc_a from r22))::int, 1, 'reward after payment');
select pg_temp.eq(public.reward_referral((select acc_a from r22))::int, 0, 'reward only once');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc_a from r22)) - (select a from bal22), 250, 'referred business +250');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc_b from r22)) - (select b from bal22), 250, 'referrer +250');
reset role;
select pg_temp.eq((select count(*) from public.credit_adjustments where reason like 'Referral bonus%' and admin_id is null), 2, 'both logged');
