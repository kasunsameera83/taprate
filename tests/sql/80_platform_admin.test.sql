-- Platform admin: only listed admins with two-step verification; businesses can't reach any of it.
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

-- The platform admin is a separate person with no business of their own.
insert into auth.users (id, email) values ('eeeeeeee-0000-0000-0000-000000000001', 'owner@taprate.test');
insert into auth.mfa_factors (user_id, status) values ('eeeeeeee-0000-0000-0000-000000000001', 'verified');
insert into public.platform_admins (user_id) values ('eeeeeeee-0000-0000-0000-000000000001');
create temp table d8 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d8 to authenticated, service_role;

-------------------------------------------------------------------------------
-- Not an admin: nothing works, even a business owner
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select case when public.platform_admin_status() = 'none' then 1 else 0 end), 1, 'business owner is not an admin');
select pg_temp.expect_fail($q$select public.admin_overview()$q$, 'owner reads overview', 'forbidden');
select pg_temp.expect_fail($q$select * from public.admin_list_accounts('', 10, 0)$q$, 'owner lists businesses', 'forbidden');
select pg_temp.expect_fail($q$select public.admin_adjust_credits((select acc from d8), 100000, 'free credits')$q$, 'owner gives self credits', 'forbidden');
select pg_temp.expect_fail($q$select public.admin_set_suspended((select acc from d8), false, null)$q$, 'owner unsuspends self', 'forbidden');
select pg_temp.expect_fail($q$insert into public.platform_admins (user_id) values ('dddddddd-0000-0000-0000-000000000001')$q$, 'owner makes self admin', 'permission denied');
update public.billing_catalog set lkr_month = 100 where item = 'growth'; -- RLS: silently matches no rows
select pg_temp.expect_fail($q$insert into public.site_promotions (kind, name, title, starts_at, ends_at) values ('popup', 'x', 'x', now(), now() + interval '1 day')$q$, 'owner adds promotion', 'row-level security');
select pg_temp.eq((select count(*) from public.platform_audit_log), 0, 'owner sees no platform log');
select pg_temp.eq((select count(*) from public.billing_catalog), 0, 'owner reads catalog only through the server');
reset role;
select pg_temp.eq((select count(*) from public.billing_catalog where item = 'growth' and lkr_month = 1490000), 1, 'price unchanged');

-- Admin without two-step verification in this session: refused.
set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001', 'aal1');
select pg_temp.eq((select case when public.platform_admin_status() = 'needs_mfa' then 1 else 0 end), 1, 'admin needs mfa');
select pg_temp.expect_fail($q$select public.admin_overview()$q$, 'admin without mfa', 'forbidden');
reset role;

-------------------------------------------------------------------------------
-- Admin with two-step verification
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select case when public.platform_admin_status() = 'ok' then 1 else 0 end), 1, 'admin ok');
select pg_temp.eq((select (public.admin_overview() ->> 'businesses')::bigint > 0)::int, 1, 'overview works');
select pg_temp.eq((select count(*) from public.admin_list_accounts('100%', 10, 0)), 0, 'wildcards are plain text');
select pg_temp.eq((select (count(*) > 0)::int from public.admin_list_accounts('', 100, 0)), 1, 'lists businesses');
select pg_temp.expect_fail($q$select * from public.admin_list_accounts('', 1000, 0)$q$, 'huge page', 'invalid query');
select pg_temp.eq((select (public.admin_account_detail((select acc from d8)) ->> 'credits') is not null)::int, 1, 'detail works');
-- Admin sees business numbers, never ratings or comments.
select pg_temp.eq((select count(*) from public.responses), 0, 'admin cannot read responses');

select public.admin_adjust_credits((select acc from d8), 500, 'Goodwill after outage');
select pg_temp.eq((select count(*) from public.credit_adjustments where account_id = (select acc from d8) and amount = 500), 1, 'adjustment logged');
select pg_temp.expect_fail($q$select public.admin_adjust_credits((select acc from d8), 5, '')$q$, 'adjustment without reason', 'reason required');
select pg_temp.expect_fail($q$select public.admin_adjust_credits((select acc from d8), 0, 'nothing')$q$, 'zero adjustment', 'invalid amount');
select pg_temp.eq(public.admin_adjust_credits((select acc from d8), -999999, 'Remove test credits'), 0, 'balance never below zero');
select public.admin_adjust_credits((select acc from d8), 100, 'Top up for test');

update public.billing_catalog set lkr_month = 1590000 where item = 'growth';
select pg_temp.eq((select count(*) from public.billing_catalog where item = 'growth' and lkr_month = 1590000), 1, 'admin edits price');
select pg_temp.expect_fail($q$update public.billing_catalog set item = 'enterprise' where item = 'growth'$q$, 'admin renames item id', 'permission denied');
select pg_temp.expect_fail($q$update public.billing_catalog set lkr_month = 1 where item = 'growth'$q$, 'absurd price', 'check');
select pg_temp.expect_fail($q$insert into public.site_promotions (kind, name, title, cta_label, cta_url, starts_at, ends_at) values ('popup', 'x', 'x', 'Go', 'javascript:alert(1)', now(), now() + interval '1 day')$q$, 'javascript link', 'check');
select pg_temp.expect_fail($q$insert into public.site_promotions (kind, name, title, cta_label, cta_url, starts_at, ends_at) values ('popup', 'x', 'x', 'Go', '//evil.com', now(), now() + interval '1 day')$q$, 'protocol-relative link', 'check');
insert into public.site_promotions (kind, name, title, cta_label, cta_url, theme, starts_at, ends_at) values ('popup', 'Avurudu', 'Avurudu offer', 'See plans', '/#pricing', 'avurudu', now(), now() + interval '7 days');
insert into public.site_content (key, draft) values ('landing', '{"hero":{}}');
update public.site_content set published = draft, published_at = now() where key = 'landing';
-- The app saves drafts with an upsert (insert ... on conflict update, which also sets key).
insert into public.site_content (key, draft) values ('landing', '{"hero":{"x":1}}') on conflict (key) do update set key = excluded.key, draft = excluded.draft;
select pg_temp.expect_fail($q$insert into public.site_content (key, draft) values ('evil', '{}')$q$, 'unknown content key', 'check');

-- Suspend: the business stops collecting ratings.
select public.admin_set_suspended((select acc from d8), true, 'Chargeback investigation');
reset role;

set role service_role;
select pg_temp.eq((select count(*) from (select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('s',64), null, null, null, false, null, null) as id) x where id is null), 1, 'suspended business collects nothing');
reset role;

set role authenticated;
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000001', 'aal2');
select public.admin_set_suspended((select acc from d8), false, null);
reset role;
set role service_role;
select pg_temp.eq((select count(*) from (select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('s',64), null, null, null, false, null, null) as id) x where id is not null), 1, 'unsuspended business collects again');
reset role;

-- Business owner can see adjustments to their own account (but not change them).
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select count(*) from public.credit_adjustments), 3, 'owner sees own adjustments');
select pg_temp.expect_fail($q$insert into public.credit_adjustments (account_id, amount, reason, balance_after) values ((select acc from d8), 1, 'abc', 1)$q$, 'owner writes adjustment', 'permission denied');
reset role;
