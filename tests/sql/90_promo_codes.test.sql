-- Promo codes: admins only; discounts are part of the order; bonus once; one use per business.
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
create or replace function pg_temp.as_user(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', p_aal)::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text, text) to authenticated, service_role;

create temp table d9 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d9 to authenticated, service_role;

-- Business owners can't see or make codes.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001', 'aal2');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off) values ('FREE90', 'percent', 90)$q$, 'owner creates code', 'row-level security');
reset role;

-- Platform admin (from test 80) creates codes.
set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001', 'aal2');
insert into public.promo_codes (code, kind, percent_off) values ('LAUNCH20', 'percent', 20);
insert into public.promo_codes (code, kind, bonus_credits) values ('BONUS500', 'credits', 500);
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off) values ('ALLFREE', 'percent', 100)$q$, '100% off', 'check');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off, bonus_credits) values ('MIXED1', 'percent', 10, 5)$q$, 'mixed kinds', 'check');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off) values ('bad code', 'percent', 10)$q$, 'bad code text', 'check');
select pg_temp.expect_fail($q$update public.promo_codes set code = 'OTHER1' where code = 'LAUNCH20'$q$, 'rename code', 'permission denied');
select pg_temp.expect_fail($q$update public.promo_codes set kind = 'credits' where code = 'LAUNCH20'$q$, 'change kind', 'permission denied');
reset role;
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select count(*) from public.promo_codes), 0, 'owner cannot list codes');
reset role;

-- An order with a code: discounted amount, bonus on first payment only, one redemption.
set role service_role;
create temp table op as select gen_random_uuid() as id;
insert into public.billing_orders (id, account_id, provider, kind, item, credits, amount_minor, currency, promo_id, list_amount_minor, bonus_credits)
  values ((select id from op), (select acc from d9), 'payhere', 'topup', 'pack_1000', 1000, 952000, 'LKR', (select id from public.promo_codes where code = 'BONUS500'), 952000, 500);
create temp table bal as select credit_balance as b from public.accounts where id = (select acc from d9);
select pg_temp.expect_fail($q$select public.billing_record_payment((select id from op), 'payhere', 'pp-1', 1190000, 'LKR')$q$, 'full price paid for a discounted order', 'amount mismatch');
select public.billing_record_payment((select id from op), 'payhere', 'pp-1', 952000, 'LKR');
select pg_temp.eq((select credit_balance from public.accounts where id = (select acc from d9)) - (select b from bal), 1500, 'pack + bonus added');
select pg_temp.eq((select count(*) from public.promo_redemptions where account_id = (select acc from d9)), 1, 'redemption recorded');
select pg_temp.eq((select count(*) from public.billing_payments where provider_payment_id = 'pp-1' and description like '%code BONUS500%' and credits_granted = 1500), 1, 'receipt mentions code');
reset role;
