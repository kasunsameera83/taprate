-- Survey sending (0013): only owners/admins create sends; suppression, cooldown and daily limits hold;
-- the queue and unsubscribe functions are server-only; nobody writes the tables directly.
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

create temp table a19 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
create temp table k19 as select repeat('A', 87) as p, repeat('B', 22) as a;
grant select on a19, k19 to authenticated, service_role;

set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.expect_fail($q$select public.save_push_subscription((select acc from a19), 'https://fcm.googleapis.com/x', (select p from k19), (select a from k19), 'Phone')$q$, 'outsider subscribes to another business', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select public.save_push_subscription((select acc from a19), 'https://fcm.googleapis.com/owner', (select p from k19), (select a from k19), 'Owner phone');
select pg_temp.eq((select count(*) from public.push_subscriptions), 1, 'owner sees own device');
select pg_temp.expect_fail($q$select endpoint from public.push_subscriptions$q$, 'read push endpoint/keys', 'permission denied');
select pg_temp.expect_fail($q$select public.save_push_subscription((select acc from a19), 'http://evil/x', (select p from k19), (select a from k19), null)$q$, 'non-https endpoint', 'check');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select public.save_push_subscription((select acc from a19), 'https://fcm.googleapis.com/viewer', (select p from k19), (select a from k19), null);
select pg_temp.eq((select count(*) from public.push_subscriptions), 1, 'viewer sees only their own device');
select public.delete_push_subscription((select id from public.push_subscriptions limit 1));
reset role;
select pg_temp.eq((select count(*) from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/owner'), 1, 'others cannot delete the owner''s device');
select pg_temp.eq((select count(*) from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/viewer'), 0, 'viewer removed own device');
