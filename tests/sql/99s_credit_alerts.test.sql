-- 0039 credit alerts: signed-in users can read the level but can never change it; only the server can.
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
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal2')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

create temp table a39 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a39 to authenticated, service_role;

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
do $$ begin
  if (select credit_alert_level from public.accounts where id = (select acc from a39)) is distinct from 0 then raise exception 'TEST FAILED: owner reads level 0'; end if;
end $$;
select pg_temp.expect_fail($q$update public.accounts set credit_alert_level = 2 where id = (select acc from a39)$q$, 'owner sets alert level', 'permission denied');
select pg_temp.expect_fail($q$update public.accounts set credit_balance = 99999 where id = (select acc from a39)$q$, 'owner sets own balance', 'permission denied');
reset role;

set role service_role;
update public.accounts set credit_alert_level = 1 where id = (select acc from a39);
select pg_temp.expect_fail($q$update public.accounts set credit_alert_level = 3 where id = (select acc from a39)$q$, 'level out of range', 'violates check');
update public.accounts set credit_alert_level = 0 where id = (select acc from a39);
reset role;
