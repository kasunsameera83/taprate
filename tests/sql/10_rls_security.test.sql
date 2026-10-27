-- Database security tests: tenant isolation, role permissions, and the public click flow.
-- Run with:  node scripts/test-db.mjs   (needs a throwaway local Postgres; see README)
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- service_role table access is granted by the migration itself.
-- (service_role grants now come from the migration)

-- Runs p_sql and requires it to fail with an error matching p_reason, so a test can't
-- "pass" because of an unrelated mistake (typo, wrong type) in the test itself.
create or replace function pg_temp.expect_fail(p_sql text, p_label text, p_reason text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_reason then
      raise exception 'TEST FAILED: % was blocked for the wrong reason: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception 'SECURITY TEST FAILED (should have been blocked): %', p_label;
end $$;

create or replace function pg_temp.expect_eq(p_actual bigint, p_expected bigint, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end $$;
grant execute on function pg_temp.expect_fail(text, text, text) to anon, authenticated, service_role;
grant execute on function pg_temp.expect_eq(bigint, bigint, text) to anon, authenticated, service_role;

-------------------------------------------------------------------------------
-- Fixtures: two separate businesses, plus a viewer in business A
-------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner-a@example.com', '{"account_name":"Business A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner-b@example.com', '{"account_name":"Business B"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'viewer-a@example.com', '{"account_name":"Viewer own"}');

-- The viewer joins Business A as viewer (server-side operation).
insert into public.memberships (account_id, user_id, role)
select m.account_id, 'aaaaaaaa-0000-0000-0000-000000000002', 'viewer'
from public.memberships m where m.user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.expect_eq((select count(*) from public.accounts), 3, 'signup trigger creates one account per user');
select pg_temp.expect_eq((select count(*) from public.memberships where role = 'owner'), 3, 'signup trigger makes the user owner');

create temp table ids as
select
  (select account_id from public.memberships where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') as acc_a,
  (select account_id from public.memberships where user_id = 'bbbbbbbb-0000-0000-0000-000000000001') as acc_b;
grant select on ids to anon, authenticated, service_role;

insert into public.surveys (id, account_id, name, question, icon_set, created_by)
select '5a000000-0000-0000-0000-000000000001', acc_a, 'A survey', 'How did we do?', 'faces5', 'aaaaaaaa-0000-0000-0000-000000000001' from ids;
insert into public.surveys (id, account_id, name, question, icon_set, created_by)
select '5b000000-0000-0000-0000-000000000001', acc_b, 'B survey', 'How did we do?', 'thumbs', 'bbbbbbbb-0000-0000-0000-000000000001' from ids;

-------------------------------------------------------------------------------
-- Anonymous role: no table access, no server functions
-------------------------------------------------------------------------------
set role anon;
select pg_temp.expect_fail('select * from public.accounts', 'anon reads accounts', 'permission denied');
select pg_temp.expect_fail('select * from public.surveys', 'anon reads surveys', 'permission denied');
select pg_temp.expect_fail('select * from public.responses', 'anon reads responses', 'permission denied');
select pg_temp.expect_fail($q$insert into public.responses (account_id, survey_id, dedupe_key) values (gen_random_uuid(), gen_random_uuid(), repeat('a',64))$q$, 'anon inserts response', 'permission denied');
select pg_temp.expect_fail($q$select public.record_click('5a000000-0000-0000-0000-000000000001', 5::smallint, repeat('a',64), null, null, null, false, null, null)$q$, 'anon calls record_click', 'permission denied');
select pg_temp.expect_fail($q$select * from public.confirm_response(gen_random_uuid())$q$, 'anon calls confirm_response', 'permission denied');
select pg_temp.expect_fail($q$select public.rate_limit_hit('x', 1, 60)$q$, 'anon calls rate_limit_hit', 'permission denied');
reset role;

-------------------------------------------------------------------------------
-- Owner of A: sees only A, cannot touch B, cannot change credits
-------------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);

select pg_temp.expect_eq((select count(*) from public.accounts), 1, 'owner A sees exactly one account');
select pg_temp.expect_eq((select count(*) from public.surveys), 1, 'owner A sees only own surveys');
select pg_temp.expect_eq((select count(*) from public.surveys where id = '5b000000-0000-0000-0000-000000000001'), 0, 'owner A cannot see B survey');

select pg_temp.expect_fail($q$insert into public.surveys (account_id, name, question, icon_set, created_by)
  select acc_b, 'evil', 'q', 'faces5', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid from ids$q$, 'owner A creates survey in B', 'row-level security');
select pg_temp.expect_fail($q$insert into public.surveys (account_id, name, question, icon_set, created_by)
  select acc_a, 'spoof', 'q', 'faces5', 'bbbbbbbb-0000-0000-0000-000000000001'::uuid from ids$q$, 'owner A spoofs created_by', 'row-level security');

-- Updates/deletes on B silently match zero rows under RLS; verify nothing changed.
update public.surveys set name = 'hacked' where id = '5b000000-0000-0000-0000-000000000001';
delete from public.surveys where id = '5b000000-0000-0000-0000-000000000001';

select pg_temp.expect_fail($q$update public.accounts set credit_balance = 999999$q$, 'owner A grants self credits', 'permission denied');
select pg_temp.expect_fail($q$update public.accounts set plan = 'scale'$q$, 'owner A upgrades own plan', 'permission denied');
select pg_temp.expect_fail($q$update public.surveys set account_id = (select acc_b from ids) where id = '5a000000-0000-0000-0000-000000000001'$q$, 'owner A moves survey to B', 'permission denied|row-level security|account_id cannot change');
select pg_temp.expect_fail($q$insert into public.responses (account_id, survey_id, dedupe_key) select acc_a, '5a000000-0000-0000-0000-000000000001'::uuid, repeat('b',64) from ids$q$, 'owner A fabricates a response', 'permission denied');
select pg_temp.expect_fail($q$insert into public.memberships (account_id, user_id, role) select acc_b, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'owner' from ids$q$, 'owner A joins B', 'permission denied');
select pg_temp.expect_fail($q$select public.record_click('5a000000-0000-0000-0000-000000000001', 5::smallint, repeat('a',64), null, null, null, false, null, null)$q$, 'user calls record_click', 'permission denied');

-- Allowed: owner renames own account and edits own survey.
update public.accounts set name = 'Business A renamed';
update public.surveys set question = 'How was your support today?' where id = '5a000000-0000-0000-0000-000000000001';
reset role;

select pg_temp.expect_eq((select count(*) from public.surveys where id = '5b000000-0000-0000-0000-000000000001' and name = 'B survey'), 1, 'B survey untouched by A');
select pg_temp.expect_eq((select count(*) from public.accounts where name = 'Business A renamed'), 1, 'owner can rename own account');

-------------------------------------------------------------------------------
-- Viewer in A: read-only
-------------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002"}', false);
select pg_temp.expect_eq((select count(*) from public.surveys where id = '5a000000-0000-0000-0000-000000000001'), 1, 'viewer can read account surveys');
select pg_temp.expect_fail($q$insert into public.surveys (account_id, name, question, icon_set, created_by)
  select acc_a, 'v', 'q', 'faces5', 'aaaaaaaa-0000-0000-0000-000000000002'::uuid from ids$q$, 'viewer creates survey', 'row-level security');
update public.surveys set name = 'viewer edit' where id = '5a000000-0000-0000-0000-000000000001';
select pg_temp.expect_eq((select count(*) from public.audit_log), 0, 'viewer cannot read audit log');
reset role;
select pg_temp.expect_eq((select count(*) from public.surveys where name = 'viewer edit'), 0, 'viewer edit had no effect');

-------------------------------------------------------------------------------
-- Public flow through server-only functions (service role)
-------------------------------------------------------------------------------
set role service_role;

-- Out-of-range ratings are rejected by the database itself.
select pg_temp.expect_fail($q$select public.record_click('5a000000-0000-0000-0000-000000000001', 9::smallint, repeat('c',64), null, null, null, false, null, null)$q$, 'rating 9 on a 5-point survey', 'rating out of range');
select pg_temp.expect_fail($q$select public.record_click('5b000000-0000-0000-0000-000000000001', 0::smallint, repeat('c',64), null, null, null, false, null, null)$q$, 'rating 0 on thumbs survey', 'rating out of range');

-- Same dedupe key twice -> one row, latest pending rating wins.
create temp table r1 as select public.record_click('5a000000-0000-0000-0000-000000000001', 2::smallint, repeat('d',64), 'c@x.com', 'Sarah', 'T-1', false, null, 'Mozilla') as id;
create temp table r2 as select public.record_click('5a000000-0000-0000-0000-000000000001', 4::smallint, repeat('d',64), 'c@x.com', 'Sarah', 'T-1', false, null, 'Mozilla') as id;
select pg_temp.expect_eq((select count(*) from public.responses where dedupe_key = repeat('d',64)), 1, 're-click does not add a row');
select pg_temp.expect_eq((select count(*) from r1 join r2 using (id)), 1, 're-click returns same response id');
select pg_temp.expect_eq((select pending_rating from public.responses where id = (select id from r1)), 4, 'latest click is the pending rating');
select pg_temp.expect_eq((select count(*) from public.responses where id = (select id from r1) and rating is null), 1, 'pending click is not yet a rating');

-- Confirm: becomes the rating and uses exactly one credit, even when confirmed again later.
create temp table bal0 as select credit_balance as b from public.accounts where id = (select acc_a from ids);
select pg_temp.expect_eq((select count(*) from public.confirm_response((select id from r1)) where result = 'confirmed'), 1, 'confirm succeeds');
select pg_temp.expect_eq((select rating from public.responses where id = (select id from r1)), 4, 'confirmed rating stored');
select pg_temp.expect_eq((select credit_balance from public.accounts where id = (select acc_a from ids)), (select b - 1 from bal0), 'first confirm uses one credit');
select public.record_click('5a000000-0000-0000-0000-000000000001', 5::smallint, repeat('d',64), 'c@x.com', 'Sarah', 'T-1', false, null, 'Mozilla');
select pg_temp.expect_eq((select rating from public.responses where id = (select id from r1)), 4, 'unconfirmed re-click does not change a confirmed rating');
select pg_temp.expect_eq((select count(*) from public.confirm_response((select id from r1)) where result = 'confirmed' and rating_changed), 1, 'confirmed change of mind');
select pg_temp.expect_eq((select credit_balance from public.accounts where id = (select acc_a from ids)), (select b - 1 from bal0), 'changing a rating costs no extra credit');
select pg_temp.expect_eq((select count(*) from public.confirm_response((select id from r1)) where result = 'already'), 1, 'double confirm is a no-op');

-- Out of credits -> survey closed.
update public.accounts set credit_balance = 0 where id = (select acc_a from ids);
select pg_temp.expect_eq((select count(*) from (select public.record_click('5a000000-0000-0000-0000-000000000001', 3::smallint, repeat('e',64), null, null, null, false, null, null) as id) x where id is null), 1, 'no credits -> click not recorded');
-- Paused survey -> closed.
update public.accounts set credit_balance = 10 where id = (select acc_a from ids);
update public.surveys set status = 'paused' where id = '5a000000-0000-0000-0000-000000000001';
select pg_temp.expect_eq((select count(*) from (select public.record_click('5a000000-0000-0000-0000-000000000001', 3::smallint, repeat('f',64), null, null, null, false, null, null) as id) x where id is null), 1, 'paused survey -> click not recorded');
update public.surveys set status = 'active' where id = '5a000000-0000-0000-0000-000000000001';

-- Scale is locked once responses exist.
select pg_temp.expect_fail($q$update public.surveys set icon_set = 'nps' where id = '5a000000-0000-0000-0000-000000000001'$q$, 'change scale after responses', 'icon_set cannot change');

-- Rate limiter.
select pg_temp.expect_eq((select count(*) from (select public.rate_limit_hit('t:1', 2, 60) a union all select public.rate_limit_hit('t:1', 2, 60) union all select public.rate_limit_hit('t:1', 2, 60)) x where a), 2, 'rate limit allows exactly the limit');
reset role;

-- B's owner sees A's response? No.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001"}', false);
select pg_temp.expect_eq((select count(*) from public.responses), 0, 'owner B cannot see A responses');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001"}', false);
select pg_temp.expect_eq((select count(*) from public.responses), 1, 'owner A sees own response');
select pg_temp.expect_fail($q$update public.responses set rating = 1$q$, 'owner edits a customer rating', 'permission denied');
select pg_temp.expect_fail($q$delete from public.responses$q$, 'owner deletes responses', 'permission denied');
reset role;

select 'ALL DATABASE SECURITY TESTS PASSED' as result;
