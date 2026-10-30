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

-- Daily email limits follow the plan (0029). Free and trial: 100; starter 500; growth 2,000; scale 5,000; paused 0.
create temp table a29 as select account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
grant select on a29 to authenticated, service_role;

select pg_temp.eq(private.daily_send_limit('trial'), 100, 'trial limit');
select pg_temp.eq(private.daily_send_limit('free'), 100, 'free limit (was 2,000)');
select pg_temp.eq(private.daily_send_limit('starter'), 500, 'starter limit');
select pg_temp.eq(private.daily_send_limit('growth'), 2000, 'growth limit');
select pg_temp.eq(private.daily_send_limit('scale'), 5000, 'scale limit');
select pg_temp.eq(private.daily_send_limit('paused'), 0, 'paused cannot send');
select pg_temp.eq(private.daily_send_limit('bogus'), 0, 'unknown plan cannot send');

delete from public.send_recipients where account_id = (select acc from a29);
update public.accounts set plan = 'free', suspended_at = null where id = (select acc from a29);
select pg_temp.eq(private.send_allowance((select acc from a29)), 100, 'free account allowance');
update public.accounts set plan = 'starter' where id = (select acc from a29);
select pg_temp.eq(private.send_allowance((select acc from a29)), 500, 'starter account allowance');
update public.accounts set plan = 'scale' where id = (select acc from a29);
select pg_temp.eq(private.send_allowance((select acc from a29)), 5000, 'scale account allowance');
update public.accounts set plan = 'paused' where id = (select acc from a29);
select pg_temp.eq(private.send_allowance((select acc from a29)), 0, 'paused account allowance');

-- A paused business is stopped at the door.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from a29), '5d000000-0000-0000-0000-000000000001', 'Paused', 'Hi', '', null, null::smallint, 0::smallint, '[{"email":"p@x.lk"}]')$q$, 'paused business sends', 'daily send limit');
reset role;

-- Only the server can call the helpers.
select pg_temp.eq((select count(*) from information_schema.routine_privileges where routine_schema = 'private' and routine_name in ('daily_send_limit', 'send_allowance') and grantee in ('anon', 'authenticated', 'PUBLIC'))::bigint, 0, 'helpers not callable by users');

update public.accounts set plan = 'trial' where id = (select acc from a29);
