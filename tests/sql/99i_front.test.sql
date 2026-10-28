-- Front (0024): a new helpdesk kind; unknown kinds still refused; users can't write or read secrets.
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

create temp table s24 as select account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
grant select on s24 to authenticated, service_role;
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, secret_encrypted) values ((select acc from s24), 'front', 'Front', 'v1.x.y.z', 'api2.frontapp.com', 'v1.s');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from s24), 'frontapp', 'F', 'v1', 'x')$q$, 'unknown kind', 'integrations_kind_check');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, survey_id) values ((select acc from s24), 'front', 'F', 'v1', 'x', '5d000000-0000-0000-0000-000000000001')$q$, 'survey on front', 'integrations_survey_kind');

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.integrations where kind = 'front'), 1, 'owner sees front');
select pg_temp.expect_fail($q$select secret_encrypted from public.integrations where kind = 'front'$q$, 'owner reads token', 'permission denied');
select pg_temp.expect_fail($q$update public.integrations set url_encrypted = 'x' where kind = 'front'$q$, 'owner changes address', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002');
select pg_temp.eq((select count(*) from public.integrations where kind = 'front'), 0, 'agent sees none');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.integrations where kind = 'front'), 0, 'other business sees none');
reset role;

delete from public.integrations where kind = 'front';
