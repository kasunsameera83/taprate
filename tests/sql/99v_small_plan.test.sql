-- 0042 Small shop plan: allowed everywhere a plan id is, priced in the catalog, 150 emails a day,
-- Starter's features (not Growth's), and bought like any other plan (server only).
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

-- The price row.
select pg_temp.ok((select lkr_month from public.billing_catalog where item = 'small') = 199000, 'Rs 1,990');
select pg_temp.ok((select usd_month from public.billing_catalog where item = 'small') = 700, '$7');
select pg_temp.ok((select responses from public.billing_catalog where item = 'small') = 150, '150 responses');
select pg_temp.ok((select sort from public.billing_catalog where item = 'small') < (select sort from public.billing_catalog where item = 'starter'), 'shown before Starter');

-- Limits and features.
select pg_temp.ok(private.daily_send_limit('small') = 150, '150 emails a day');
select pg_temp.ok(private.daily_send_limit('starter') = 500, 'starter unchanged');
select pg_temp.ok(private.daily_send_limit('tiny') = 0, 'unknown plan sends nothing');
select pg_temp.ok(private.plan_allows('small', 'integrations') and private.plan_allows('small', 'api') and private.plan_allows('small', 'social'), 'starter features');
select pg_temp.ok(not private.plan_allows('small', 'white_label'), 'no white label');
select pg_temp.ok(not private.plan_allows('small', 'own_domain') and not private.plan_allows('small', 'custom_domain'), 'no own domains');
select pg_temp.ok(not private.plan_allows('free', 'integrations'), 'free still without');

create temp table a42 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a42 to authenticated, service_role;
create temp table o42 (id uuid);
insert into o42 values (gen_random_uuid());
grant select on o42 to authenticated, service_role;
create temp table keep42 as select plan, credit_balance from public.accounts where id = (select acc from a42);

update public.subscriptions set status = 'ended' where account_id = (select acc from a42);
update public.accounts set plan = 'free', credit_balance = 0 where id = (select acc from a42);

-- Only real plan ids.
select pg_temp.expect_fail($q$update public.accounts set plan = 'tiny' where id = (select acc from a42)$q$, 'unknown plan', 'check');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off, applies_to) values ('BADITEM', 'percent', 10, array['tiny'])$q$, 'promo for unknown item', 'check');
insert into public.promo_codes (code, kind, percent_off, applies_to) values ('SMALLTEST', 'percent', 10, array['small']);
select pg_temp.ok((select applies_to from public.promo_codes where code = 'SMALLTEST') = array['small'], 'promo can target small');
delete from public.promo_codes where code = 'SMALLTEST';

-- The owner can't give themselves the plan.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$update public.accounts set plan = 'small' where id = (select acc from a42)$q$, 'owner sets own plan', 'permission denied');
reset role;

-- Bought like any plan: the server records a prepaid payment.
set role service_role;
insert into public.billing_orders (id, account_id, provider, kind, item, billing_interval, credits, amount_minor, currency, prepaid_months) values
  ((select id from o42), (select acc from a42), 'payhere', 'plan', 'small', 'month', 150, 199000, 'LKR', 1);
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from o42), 'payhere', 'ps1', 100, 'LKR')$q$, 'wrong amount', 'amount mismatch');
select pg_temp.ok(public.billing_record_payment((select id from o42), 'payhere', 'ps1', 199000, 'LKR', null, '2099-01-01T00:00:00Z') = 'granted', 'small granted');
reset role;
select pg_temp.ok((select plan from public.accounts where id = (select acc from a42)) = 'small', 'plan is small');
select pg_temp.ok((select credit_balance from public.accounts where id = (select acc from a42)) >= 150, '150 responses added');
select pg_temp.ok((select plan from public.subscriptions where provider_sub_id = 'prepaid:' || (select id from o42)::text) = 'small', 'subscription is small');
select pg_temp.ok(private.account_limit((select acc from a42), 'members') = 1000, 'unlimited team');
select pg_temp.ok(private.account_allows((select acc from a42), 'integrations'), 'account gets features');

-- Put the test business back.
update public.subscriptions set status = 'ended' where account_id = (select acc from a42);
update public.accounts a set plan = k.plan, credit_balance = k.credit_balance from keep42 k where a.id = (select acc from a42);
