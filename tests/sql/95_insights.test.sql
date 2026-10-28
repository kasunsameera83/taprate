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
