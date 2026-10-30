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

-- Free plan settings (0030): one row; only platform admins with 2-step verification read or change it;
-- new businesses start with its free responses; free/trial email limits follow it.
select pg_temp.eq((select count(*) from public.platform_settings), 1, 'one settings row');
select pg_temp.expect_fail($q$insert into public.platform_settings (id) values (false)$q$, 'second settings row', 'violates check|duplicate');

-- Ordinary users see nothing and change nothing.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from public.platform_settings), 0, 'owner cannot read settings');
update public.platform_settings set free_responses = 1000;
reset role;
select pg_temp.eq((select free_responses from public.platform_settings), 50, 'owner update had no effect');
set role anon;
select pg_temp.expect_fail($q$select * from public.platform_settings$q$, 'anon reads settings', 'permission denied');
reset role;

-- A platform admin with 2-step verification can change it; without it they can't.
insert into public.platform_admins (user_id) values ('dddddddd-0000-0000-0000-000000000003') on conflict do nothing;
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-000000000003', 'aal', 'aal1')::text, false);
set role authenticated;
update public.platform_settings set free_responses = 999;
reset role;
select pg_temp.eq((select free_responses from public.platform_settings), 50, 'admin without 2-step cannot change it');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003');
set role authenticated;
update public.platform_settings set free_responses = 120, free_daily_emails = 30;
select pg_temp.expect_fail($q$update public.platform_settings set id = false$q$, 'admin changes the row key', 'permission denied');
select pg_temp.expect_fail($q$update public.platform_settings set free_responses = 5000$q$, 'free responses over 1,000', 'violates check');
reset role;
select pg_temp.eq((select free_responses from public.platform_settings), 120, 'admin changed free responses');

-- New businesses start with the new number, whatever the insert says.
insert into public.accounts (name) values ('Free plan test') ;
select pg_temp.eq((select credit_balance from public.accounts where name = 'Free plan test'), 120, 'new business gets the free responses');
insert into public.accounts (name, credit_balance) values ('Free plan test 2', 99999);
select pg_temp.eq((select credit_balance from public.accounts where name = 'Free plan test 2'), 120, 'insert cannot pick its own balance');

-- Free and trial email limits follow the setting; paid plans don't.
select pg_temp.eq(private.daily_send_limit('free'), 30, 'free limit follows setting');
select pg_temp.eq(private.daily_send_limit('trial'), 30, 'trial limit follows setting');
select pg_temp.eq(private.daily_send_limit('starter'), 500, 'starter unchanged');
select pg_temp.eq(private.daily_send_limit('paused'), 0, 'paused still 0');

-- Existing businesses keep their balance when the setting changes.
select pg_temp.eq((select count(*) from public.accounts where credit_balance = 120 and name not like 'Free plan test%'), 0, 'existing balances untouched');

delete from public.accounts where name like 'Free plan test%';
delete from public.platform_admins where user_id = 'dddddddd-0000-0000-0000-000000000003';
update public.platform_settings set free_responses = 50, free_daily_emails = 100;
