-- 0040 prepaid plans: one-off plan payments set a period worked out in the database, renewals add on,
-- switching starts today, refunds end the plan, and only the server can do any of it.
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
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'TEST FAILED: %', p_label; end if;
end $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal2')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.ok(boolean, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

create temp table a40 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a40 to authenticated, service_role;
update public.subscriptions set status = 'ended' where account_id = (select acc from a40);
update public.accounts set plan = 'free', credit_balance = 0 where id = (select acc from a40);

create temp table o40 (n int, id uuid);
insert into o40 values (1, gen_random_uuid()), (2, gen_random_uuid()), (3, gen_random_uuid()), (4, gen_random_uuid());
grant select on o40 to authenticated, service_role;

set role service_role;
-- Prepaid only for monthly plans.
select pg_temp.expect_fail($q$insert into public.billing_orders (account_id, provider, kind, item, credits, amount_minor, currency, prepaid_months) values ((select acc from a40), 'payhere', 'topup', 'pack_250', 250, 350000, 'LKR', 1)$q$, 'prepaid top-up', 'check');
select pg_temp.expect_fail($q$insert into public.billing_orders (account_id, provider, kind, item, billing_interval, credits, amount_minor, currency, prepaid_months) values ((select acc from a40), 'payhere', 'plan', 'starter', 'year', 6000, 5900000, 'LKR', 1)$q$, 'prepaid yearly', 'check');
select pg_temp.expect_fail($q$insert into public.billing_orders (account_id, provider, kind, item, billing_interval, credits, amount_minor, currency, prepaid_months) values ((select acc from a40), 'payhere', 'plan', 'starter', 'month', 500, 590000, 'LKR', 13)$q$, '13 months', 'check');

insert into public.billing_orders (id, account_id, provider, kind, item, billing_interval, credits, amount_minor, currency, prepaid_months) values
  ((select id from o40 where n = 1), (select acc from a40), 'payhere', 'plan', 'starter', 'month', 500, 590000, 'LKR', 1),
  ((select id from o40 where n = 2), (select acc from a40), 'payhere', 'plan', 'starter', 'month', 1500, 1770000, 'LKR', 3),
  ((select id from o40 where n = 3), (select acc from a40), 'payhere', 'plan', 'growth', 'month', 2000, 1490000, 'LKR', 1);
reset role;

-- The owner can't record a payment themselves.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o40 where n = 1), 'payhere', 'pp1', 590000, 'LKR')$q$, 'owner records payment', 'permission denied');
reset role;

set role service_role;
-- Wrong amount refused; no subscription reference needed for prepaid.
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o40 where n = 1), 'payhere', 'pp1', 100, 'LKR')$q$, 'wrong amount', 'amount mismatch');
select pg_temp.ok(public.billing_record_payment((select id from o40 where n = 1), 'payhere', 'pp1', 590000, 'LKR', null, '2099-01-01T00:00:00Z') = 'granted', '1 month granted');
select pg_temp.ok((select plan from public.accounts where id = (select acc from a40)) = 'starter', 'plan is starter');
select pg_temp.ok((select credit_balance from public.accounts where id = (select acc from a40)) = 500, '500 responses');
-- The period comes from the order, not from the notification's date.
select pg_temp.ok((select current_period_end from public.subscriptions where provider_sub_id = 'prepaid:' || (select id from o40 where n = 1)::text)
                  between now() + interval '27 days' and now() + interval '32 days', 'ends in about a month (ignores notified date)');
select pg_temp.ok((select prepaid and cancel_at_period_end and status = 'active' from public.subscriptions where provider_sub_id = 'prepaid:' || (select id from o40 where n = 1)::text), 'prepaid, no auto renew');
-- Same payment again: once only.
select pg_temp.ok(public.billing_record_payment((select id from o40 where n = 1), 'payhere', 'pp1', 590000, 'LKR') = 'duplicate', 'duplicate ignored');

-- Renewing the same plan for 3 months adds on to the end (about 4 months from now).
select pg_temp.ok(public.billing_record_payment((select id from o40 where n = 2), 'payhere', 'pp2', 1770000, 'LKR') = 'granted', '3 months granted');
select pg_temp.ok((select count(*) from public.subscriptions where account_id = (select acc from a40) and status = 'active') = 1, 'one live plan');
select pg_temp.ok((select current_period_end from public.subscriptions where account_id = (select acc from a40) and status = 'active')
                  between now() + interval '115 days' and now() + interval '125 days', 'renewal adds on');
select pg_temp.ok((select credit_balance from public.accounts where id = (select acc from a40)) = 2000, '2000 responses');

-- Switching to Growth starts today.
select pg_temp.ok(public.billing_record_payment((select id from o40 where n = 3), 'payhere', 'pp3', 1490000, 'LKR') = 'granted', 'switch granted');
select pg_temp.ok((select plan from public.subscriptions where account_id = (select acc from a40) and status = 'active') = 'growth', 'now growth');
select pg_temp.ok((select current_period_end from public.subscriptions where account_id = (select acc from a40) and status = 'active')
                  between now() + interval '27 days' and now() + interval '32 days', 'switch starts today');
select pg_temp.ok((select plan from public.accounts where id = (select acc from a40)) = 'growth', 'account on growth');

-- A refund ends it and moves the business to free.
select pg_temp.ok(public.billing_reverse_payment('payhere', 'pp3') = 'reversed', 'refund');
select pg_temp.ok((select count(*) from public.subscriptions where account_id = (select acc from a40) and status = 'active') = 0, 'no live plan after refund');
select pg_temp.ok((select plan from public.accounts where id = (select acc from a40)) = 'free', 'back to free');

-- Recurring plans still need PayHere's subscription reference.
insert into public.billing_orders (id, account_id, provider, kind, item, billing_interval, credits, amount_minor, currency)
  values ((select id from o40 where n = 4), (select acc from a40), 'payhere', 'plan', 'starter', 'month', 500, 590000, 'LKR');
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o40 where n = 4), 'payhere', 'pp4', 590000, 'LKR')$q$, 'recurring without reference', 'subscription reference required');

-- Ended prepaid plans end through the usual function (the daily job).
reset role;

-- Owner can read the prepaid flag, can't change it.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.ok((select count(*) from public.subscriptions where account_id = (select acc from a40) and prepaid) >= 3, 'owner sees prepaid rows');
select pg_temp.expect_fail($q$update public.subscriptions set current_period_end = '2099-01-01' where account_id = (select acc from a40)$q$, 'owner extends own plan', 'permission denied');
reset role;

update public.subscriptions set status = 'ended' where account_id = (select acc from a40);
update public.accounts set plan = 'growth', credit_balance = 10 where id = (select acc from a40);
