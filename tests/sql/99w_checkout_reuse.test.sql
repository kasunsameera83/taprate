-- 0043 checkout idempotency: the same unpaid checkout within 30 minutes reuses one order; anything
-- different, older, paid or cancelled gets a new one; only the server (service role) can call it.
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

create temp table a43 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a43 to authenticated, service_role;
create temp table r43 (k text primary key, id uuid);
grant select, insert on r43 to service_role;

set role service_role;
insert into r43 select 'first', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 350000, 'LKR', null, null, 0, null);
insert into r43 select 'again', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 350000, 'LKR', null, null, 0, null);
insert into r43 select 'other_item', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_1000', null, 1000, 1190000, 'LKR', null, null, 0, null);
insert into r43 select 'plan1', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'plan', 'small', 'month', 150, 199000, 'LKR', null, null, 0, 1::smallint);
insert into r43 select 'plan3', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'plan', 'small', 'month', 450, 597000, 'LKR', null, null, 0, 3::smallint);
insert into r43 select 'plan1_again', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'plan', 'small', 'month', 150, 199000, 'LKR', null, null, 0, 1::smallint);
reset role;

select pg_temp.ok((select id from r43 where k = 'first') = (select id from r43 where k = 'again'), 'double click reuses the order');
select pg_temp.ok((select id from r43 where k = 'first') <> (select id from r43 where k = 'other_item'), 'another pack is a new order');
select pg_temp.ok((select id from r43 where k = 'plan1') <> (select id from r43 where k = 'plan3'), '3 months is a new order');
select pg_temp.ok((select id from r43 where k = 'plan1') = (select id from r43 where k = 'plan1_again'), 'same plan reuses the order');
select pg_temp.ok((select count(*) from public.billing_orders where id in (select id from r43)) = 4, 'four orders, not six');

-- A different price (e.g. a promo) is a new order.
set role service_role;
insert into r43 select 'cheaper', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 175000, 'LKR', null, 350000, 0, null);
reset role;
select pg_temp.ok((select id from r43 where k = 'cheaper') <> (select id from r43 where k = 'first'), 'different price is a new order');

-- Cancelled, paid or old orders are never reused.
update public.billing_orders set status = 'cancelled' where id = (select id from r43 where k = 'first');
set role service_role;
insert into r43 select 'after_cancel', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 350000, 'LKR', null, null, 0, null);
reset role;
select pg_temp.ok((select id from r43 where k = 'after_cancel') <> (select id from r43 where k = 'first'), 'cancelled order not reused');

update public.billing_orders set created_at = now() - interval '31 minutes' where id = (select id from r43 where k = 'after_cancel');
set role service_role;
insert into r43 select 'after_30min', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 350000, 'LKR', null, null, 0, null);
select public.billing_record_payment((select id from r43 where k = 'after_30min'), 'payhere', 'pw43', 350000, 'LKR');
insert into r43 select 'after_paid', public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 350000, 'LKR', null, null, 0, null);
reset role;
select pg_temp.ok((select id from r43 where k = 'after_30min') <> (select id from r43 where k = 'after_cancel'), 'order older than 30 minutes not reused');
select pg_temp.ok((select id from r43 where k = 'after_paid') <> (select id from r43 where k = 'after_30min'), 'paid order not reused');

-- Signed-in users can't call it (only the server can).
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.billing_create_order((select acc from a43), 'dddddddd-0000-0000-0000-000000000001', 'payhere', 'topup', 'pack_250', null, 250, 1, 'LKR', null, null, 0, null)$q$, 'user creates order directly', 'permission denied');
reset role;
set role anon;
select pg_temp.expect_fail($q$select public.billing_create_order(gen_random_uuid(), null, 'payhere', 'topup', 'pack_250', null, 250, 1, 'LKR', null, null, 0, null)$q$, 'anon creates order', 'permission denied');
reset role;

-- Put the test business back.
update public.accounts set credit_balance = greatest(0, credit_balance - 250) where id = (select acc from a43);
delete from public.billing_payments where provider = 'payhere' and provider_payment_id = 'pw43';
delete from public.billing_orders where id in (select id from r43);
