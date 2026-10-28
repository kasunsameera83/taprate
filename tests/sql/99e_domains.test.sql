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

create temp table a20 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a20 to authenticated, service_role;

set role service_role;
insert into public.sending_domains (account_id, domain, provider_id) values ((select acc from a20), 'mail.kova.lk', 'res_1');
select pg_temp.expect_fail($q$insert into public.sending_domains (account_id, domain, provider_id) values ((select acc from a20), 'MAIL.evil..lk', 'x')$q$, 'bad domain', 'check|unique|duplicate');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.sending_domains), 1, 'owner sees the domain');
select pg_temp.expect_fail($q$update public.sending_domains set status = 'verified'$q$, 'owner marks it verified', 'permission denied');
select pg_temp.expect_fail($q$select provider_id from public.sending_domains$q$, 'read provider id', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.eq((select count(*) from public.sending_domains), 0, 'viewer cannot see it');
reset role;
