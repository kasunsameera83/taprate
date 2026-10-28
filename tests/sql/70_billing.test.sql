-- Billing: users can't touch money or credits; webhooks grant exactly once, only for the right amount.
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
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal1')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- Business D: owner dddd...0001, agent ...0002, viewer ...0003
create temp table d7 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d7 to authenticated, service_role;
update public.accounts set credit_balance = 10, plan = 'trial' where id = (select acc from d7);

set role service_role;
create temp table o_plan as select gen_random_uuid() as id;
create temp table o_top as select gen_random_uuid() as id;
insert into public.billing_orders (id, account_id, provider, kind, item, billing_interval, credits, amount_minor, currency)
  values ((select id from o_plan), (select acc from d7), 'stripe', 'plan', 'growth', 'month', 2000, 4900, 'USD');
insert into public.billing_orders (id, account_id, provider, kind, item, credits, amount_minor, currency)
  values ((select id from o_top), (select acc from d7), 'payhere', 'topup', 'pack_250', 250, 350000, 'LKR');
select pg_temp.expect_fail($q$insert into public.billing_orders (account_id, provider, kind, item, credits, amount_minor, currency) values ((select acc from d7), 'stripe', 'topup', 'pack_250', 250, 350000, 'LKR')$q$, 'Stripe order in rupees', 'check');
reset role;
grant select on o_plan, o_top to authenticated, service_role;

-------------------------------------------------------------------------------
-- Users: read only (owners), never write
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.billing_orders), 2, 'owner sees orders');
select pg_temp.expect_fail($q$update public.accounts set credit_balance = 999999 where id = (select acc from d7)$q$, 'owner edits credits', 'permission denied|0 rows|policy');
select pg_temp.expect_fail($q$update public.billing_orders set amount_minor = 1$q$, 'owner edits order', 'permission denied');
select pg_temp.expect_fail($q$insert into public.billing_payments (account_id, order_id, provider, provider_payment_id, description, amount_minor, currency, credits_granted) values ((select acc from d7), (select id from o_top), 'payhere', 'x', 'x', 1, 'LKR', 100000)$q$, 'owner inserts payment', 'permission denied');
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_top), 'payhere', 'p1', 350000, 'LKR')$q$, 'owner calls grant function', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.eq((select count(*) from public.billing_orders), 0, 'viewer sees no billing');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.eq((select count(*) from public.billing_orders where account_id = (select acc from d7)), 0, 'outsider sees no billing');
reset role;
set role anon;
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_top), 'payhere', 'p1', 350000, 'LKR')$q$, 'anon calls grant function', 'permission denied');
reset role;
-- The owner's update above must not have changed anything.
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc from d7)), 10, 'credits unchanged by users');

-------------------------------------------------------------------------------
-- Webhook grants
-------------------------------------------------------------------------------
set role service_role;
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_top), 'payhere', 'p1', 100, 'LKR')$q$, 'wrong amount', 'amount mismatch');
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_top), 'payhere', 'p1', 350000, 'USD')$q$, 'wrong currency', 'amount mismatch');
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_top), 'stripe', 'p1', 350000, 'LKR')$q$, 'wrong provider', 'provider mismatch');
select pg_temp.expect_fail($q$select public.billing_record_payment(gen_random_uuid(), 'payhere', 'p1', 350000, 'LKR')$q$, 'unknown order', 'unknown order');
select pg_temp.eq((select count(*) from (select public.billing_record_payment((select id from o_top), 'payhere', 'ph-1', 350000, 'LKR') as r) x where r = 'granted'), 1, 'top-up granted');
select pg_temp.eq((select count(*) from (select public.billing_record_payment((select id from o_top), 'payhere', 'ph-1', 350000, 'LKR') as r) x where r = 'duplicate'), 1, 'replayed notification ignored');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc from d7)), 260, 'credits added once');

select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_plan), 'stripe', 'in_1', 4900, 'USD')$q$, 'plan without subscription ref', 'subscription reference required');
select public.billing_record_payment((select id from o_plan), 'stripe', 'in_1', 4900, 'USD', 'sub_1', now() + interval '1 month');
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from d7) and plan = 'growth' and credit_balance = 2260), 1, 'plan active, allowance added');
-- Renewal: a new invoice for the same subscription.
select public.billing_record_payment((select id from o_plan), 'stripe', 'in_2', 4900, 'USD', 'sub_1', now() + interval '2 months');
select pg_temp.eq((select count(*) from public.subscriptions where provider_sub_id = 'sub_1'), 1, 'renewal reuses subscription');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc from d7)), 4260, 'renewal adds allowance');
select pg_temp.eq((select count(*) from public.billing_payments where account_id = (select acc from d7) and receipt_no ~ '^TR-\d{6}$'), 3, 'each payment gets a receipt number');

-- Second live subscription for the same business is impossible.
create temp table o_plan2 as select gen_random_uuid() as id;
insert into public.billing_orders (id, account_id, provider, kind, item, billing_interval, credits, amount_minor, currency)
  values ((select id from o_plan2), (select acc from d7), 'stripe', 'plan', 'scale', 'month', 10000, 12900, 'USD');
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o_plan2), 'stripe', 'in_3', 12900, 'USD', 'sub_2', null)$q$, 'two live subscriptions', 'subscriptions_one_live');

-- Refund takes back unused credits, once.
select pg_temp.eq((select count(*) from (select public.billing_reverse_payment('payhere', 'ph-1') as r) x where r = 'reversed'), 1, 'refund reversed');
select pg_temp.eq((select count(*) from (select public.billing_reverse_payment('payhere', 'ph-1') as r) x where r = 'duplicate'), 1, 'refund replay ignored');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc from d7)), 4010, 'refund removed 250 credits');
select pg_temp.eq((select count(*) from public.billing_orders where id = (select id from o_top) and status = 'refunded'), 1, 'order marked refunded');

-- Subscription ends: business drops to free, keeps credits.
select public.billing_subscription_update('stripe', 'sub_1', 'active', true, null);
select pg_temp.eq((select count(*) from public.subscriptions where provider_sub_id = 'sub_1' and cancel_at_period_end), 1, 'cancel scheduled');
select public.billing_subscription_update('stripe', 'sub_1', 'ended', null, null);
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from d7) and plan = 'free' and credit_balance = 4010), 1, 'ended: free plan, credits kept');
select pg_temp.eq((select count(*) from (select public.billing_subscription_update('stripe', 'sub_1', 'active', null, null) as r) x where r = 'already ended'), 1, 'ended subscription cannot be revived');
select pg_temp.expect_fail($q$select public.billing_subscription_update('stripe', 'sub_1', 'hacked', null, null)$q$, 'invalid status', 'invalid status');
reset role;
