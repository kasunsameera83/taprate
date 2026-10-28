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

create temp table s15 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
grant select on s15 to authenticated, service_role;
update public.accounts set local_languages = false where id = (select acc from s15);

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$update public.surveys set language = 'si' where id = (select sid from s15)$q$, 'Sinhala before it is switched on', 'language not available');
select pg_temp.expect_fail($q$update public.accounts set local_languages = true where id = (select acc from s15)$q$, 'business switches it on itself', 'permission denied');
select pg_temp.expect_fail($q$select public.admin_set_local_languages((select acc from s15), true)$q$, 'non-admin uses the admin switch', 'forbidden');
select pg_temp.expect_fail($q$select public.enable_local_languages((select acc from s15))$q$, 'user calls the server-only switch', 'permission denied');
update public.surveys set reasons_question_positive = 'What did you love?' where id = (select sid from s15);
select pg_temp.eq((select count(*) from public.surveys where id = (select sid from s15) and reasons_question_positive = 'What did you love?'), 1, 'owner sets own reasons question');
select pg_temp.expect_fail($q$update public.surveys set reasons_question_negative = '<b>x</b>' where id = (select sid from s15)$q$, 'markup in question', 'check');
reset role;

set role service_role;
select public.enable_local_languages((select acc from s15));
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
update public.surveys set language = 'ta' where id = (select sid from s15);
select pg_temp.eq((select count(*) from public.surveys where id = (select sid from s15) and language = 'ta'), 1, 'Tamil once switched on');
select pg_temp.expect_fail($q$update public.surveys set language = 'fr' where id = (select sid from s15)$q$, 'unknown language', 'check');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
update public.surveys set language = 'en' where id = (select sid from s15);
reset role;
select pg_temp.eq((select count(*) from public.surveys where id = (select sid from s15) and language = 'ta'), 1, 'viewer cannot change the language');
update public.surveys set language = 'en' where id = (select sid from s15);
