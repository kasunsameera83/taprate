-- Insights: AI switch is owner-only; summaries readable by owner/admin/viewer only; report settings private.
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

create temp table d10 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d10 to authenticated, service_role;

-- AI switch: owner only.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
update public.accounts set ai_insights_enabled = true where id = (select acc from d10);
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from d10) and ai_insights_enabled), 0, 'viewer cannot switch AI on');
update public.accounts set ai_insights_enabled = true where id = (select acc from d10);
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from d10) and ai_insights_enabled), 1, 'owner switches AI on');
select pg_temp.expect_fail($q$update public.accounts set credit_balance = 99999 where id = (select acc from d10)$q$, 'owner edits credits via this grant', 'permission denied');
reset role;

-- Saved summaries.
set role service_role;
insert into public.insights (account_id, period_days, period_start, period_end, comment_count, rating_count, result, model)
  values ((select acc from d10), 30, now() - interval '30 days', now(), 3, 10, '{"headline":"x"}', 'test');
insert into public.report_subscriptions (account_id, user_id, frequency) values ((select acc from d10), 'dddddddd-0000-0000-0000-000000000001', 'weekly');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.eq((select count(*) from public.insights), 1, 'viewer reads summaries');
select pg_temp.eq((select count(*) from public.report_subscriptions), 0, 'viewer cannot see the owner''s report settings');
select pg_temp.expect_fail($q$insert into public.insights (account_id, period_days, period_start, period_end, comment_count, rating_count, result, model) values ((select acc from d10), 7, now(), now(), 0, 0, '{}', 'x')$q$, 'user writes a summary', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent
select pg_temp.eq((select count(*) from public.insights), 0, 'agent cannot read business-wide summaries');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.eq((select count(*) from public.insights), 0, 'outsider reads nothing');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.eq((select count(*) from public.report_subscriptions), 1, 'owner sees own report setting');
select pg_temp.expect_fail($q$update public.report_subscriptions set frequency = 'monthly'$q$, 'user edits report directly', 'permission denied');
reset role;

-- Housekeeping: service only; removes old unconfirmed clicks, closes abandoned checkouts.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.maintenance_cleanup()$q$, 'user runs cleanup', 'permission denied');
reset role;
set role service_role;
insert into public.responses (account_id, survey_id, pending_rating, status, dedupe_key, created_at)
  values ((select acc from d10), '5d000000-0000-0000-0000-000000000001', 4, 'pending', repeat('o', 64), now() - interval '40 days');
create temp table oo as select gen_random_uuid() as id;
insert into public.billing_orders (id, account_id, provider, kind, item, credits, amount_minor, currency, created_at)
  values ((select id from oo), (select acc from d10), 'stripe', 'topup', 'pack_250', 250, 1200, 'USD', now() - interval '10 days');
select public.maintenance_cleanup();
select pg_temp.eq((select count(*) from public.responses where dedupe_key = repeat('o', 64)), 0, 'old unconfirmed click removed');
select pg_temp.eq((select count(*) from public.billing_orders where id = (select id from oo) and status = 'cancelled'), 1, 'abandoned checkout closed');
reset role;

-- Custom icons and labels (0012).
create temp table sv as select id, account_id from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
grant select on sv to authenticated, service_role;
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
update public.surveys set option_labels = '{"5":"Loved it","1":"Not great"}' where id = (select id from sv);
select pg_temp.eq((select count(*) from public.surveys where id = (select id from sv) and option_labels ->> '5' = 'Loved it'), 1, 'owner sets labels');
select pg_temp.expect_fail($q$update public.surveys set option_labels = '{"9":"x"}' where id = (select id from sv)$q$, 'label outside scale', 'invalid label rating');
select pg_temp.expect_fail($q$update public.surveys set option_labels = '{"3":"<script>"}' where id = (select id from sv)$q$, 'label with markup', 'invalid option label');
select pg_temp.expect_fail($q$update public.surveys set option_labels = jsonb_build_object('3', repeat('x', 30)) where id = (select id from sv)$q$, 'label too long', 'invalid option label');
select pg_temp.expect_fail($q$update public.surveys set icon_images = '{"5":"accounts/x/evil.png"}' where id = (select id from sv)$q$, 'user sets icon path', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
update public.surveys set option_labels = '{"5":"Hacked"}' where id = (select id from sv);
reset role;
select pg_temp.eq((select count(*) from public.surveys where id = (select id from sv) and option_labels ->> '5' = 'Loved it'), 1, 'viewer cannot change labels');

set role service_role;
update public.surveys set icon_images = jsonb_build_object('5', 'accounts/' || (select account_id from sv) || '/surveys/' || (select id from sv) || '/icon-5-abcdefghijklmnop.png') where id = (select id from sv);
select pg_temp.eq((select count(*) from public.surveys where id = (select id from sv) and icon_images ? '5'), 1, 'server sets a valid icon');
select pg_temp.expect_fail($q$update public.surveys set icon_images = jsonb_build_object('5', 'accounts/' || (select account_id from sv) || '/surveys/5b000000-0000-0000-0000-000000000001/icon-5-abcdefghijklmnop.png') where id = (select id from sv)$q$, 'icon from another survey folder', 'invalid icon path');
select pg_temp.expect_fail($q$update public.surveys set icon_images = jsonb_build_object('5', 'accounts/' || (select account_id from sv) || '/surveys/' || (select id from sv) || '/icon-5-abcdefghijklmnop.svg') where id = (select id from sv)$q$, 'svg icon', 'invalid icon path');
select pg_temp.expect_fail($q$update public.surveys set icon_images = jsonb_build_object('7', 'accounts/' || (select account_id from sv) || '/surveys/' || (select id from sv) || '/icon-7-abcdefghijklmnop.png') where id = (select id from sv)$q$, 'icon outside scale', 'invalid icon rating');
reset role;
