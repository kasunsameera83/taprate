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

-- Notifications (0034): each member marks only their own "seen" time, only in a business they belong to.
create temp table a34 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a34 to authenticated, service_role;
update public.memberships set notifications_seen_at = now() - interval '1 day' where account_id = (select acc from a34);

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent
set role authenticated;
select public.mark_notifications_seen((select acc from a34));
reset role;
select pg_temp.eq((select count(*) from public.memberships where account_id = (select acc from a34) and notifications_seen_at > now() - interval '1 minute'), 1, 'only the caller''s own row is marked');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
set role authenticated;
select pg_temp.expect_fail($q$select public.mark_notifications_seen((select acc from a34))$q$, 'outsider marks another business', 'forbidden');
reset role;
set role anon;
select pg_temp.expect_fail($q$select public.mark_notifications_seen((select acc from a34))$q$, 'anon marks', 'permission denied');
reset role;
-- Users can't set the time directly (no column grant).
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$update public.memberships set notifications_seen_at = now() + interval '10 years' where user_id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'direct update', 'permission denied');
reset role;
