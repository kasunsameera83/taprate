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

create temp table s21 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
create temp table ids21 (k text primary key, v uuid);
grant select on s21 to authenticated, service_role;
grant select, insert on ids21 to authenticated, service_role;
update public.surveys set status = 'active' where id = (select sid from s21);
update public.accounts set suspended_at = null, plan = 'growth' where id = (select acc from s21);

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into ids21 select 'm', (public.create_survey_send((select acc from s21), (select sid from s21), 'Monthly', 'How are we doing?', '', null, null::smallint, 0::smallint, '[{"email":"m1@x.lk"},{"email":"m2@x.lk","name":"Two"}]') ->> 'id')::uuid;
select pg_temp.expect_fail($q$select public.set_send_repeat((select v from ids21 where k = 'm'), 45::smallint)$q$, 'odd repeat interval', 'invalid repeat');
select public.set_send_repeat((select v from ids21 where k = 'm'), 30::smallint);
select pg_temp.eq((select count(*) from public.survey_sends where id = (select v from ids21 where k = 'm') and repeat_days = 30 and next_run_at is not null), 1, 'repeat set');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003');
select pg_temp.expect_fail($q$select public.set_send_repeat((select v from ids21 where k = 'm'), null)$q$, 'viewer changes repeat', 'forbidden');
select pg_temp.expect_fail($q$select public.run_repeat_sends()$q$, 'user runs the repeat job', 'permission denied');
reset role;

-- Make it due and run.
update public.survey_sends set next_run_at = now() - interval '1 minute' where id = (select v from ids21 where k = 'm');
insert into public.email_suppressions (account_id, email, reason) values ((select acc from s21), 'm1@x.lk', 'unsubscribed');
set role service_role;
select pg_temp.eq(public.run_repeat_sends(), 1, 'one repeat created');
select pg_temp.eq((select count(*) from public.survey_sends where repeat_of = (select v from ids21 where k = 'm')), 1, 'new send linked to the original');
select pg_temp.eq((select count(*) from public.send_recipients r join public.survey_sends s on s.id = r.send_id where s.repeat_of = (select v from ids21 where k = 'm') and r.status = 'queued'), 1, 'unsubscribed person not emailed again');
select pg_temp.eq(public.run_repeat_sends(), 0, 'not again until next time');
select pg_temp.eq((select count(*) from public.survey_sends where id = (select v from ids21 where k = 'm') and next_run_at > now() + interval '29 days'), 1, 'next run moved a month on');
reset role;
