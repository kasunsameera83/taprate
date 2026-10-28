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

create temp table s18 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
create temp table ids18 (k text primary key, v uuid);
grant select on s18 to authenticated, service_role;
grant select, insert on ids18 to authenticated, service_role;
update public.surveys set status = 'active', followups_enabled = true, recovery_email = true where id = (select sid from s18);
update public.accounts set suspended_at = null, plan = 'growth', credit_balance = 1000 where id = (select acc from s18);

insert into ids18 values ('orig', gen_random_uuid()), ('noemail', gen_random_uuid());
insert into public.responses (id, account_id, survey_id, rating, status, respondent_email, ticket_ref, dedupe_key, channel, confirmed_at)
  values ((select v from ids18 where k = 'orig'), (select acc from s18), (select sid from s18), 1, 'confirmed', 'Sad@X.lk', 'T-9', repeat('1a', 32), 'email', now()),
         ((select v from ids18 where k = 'noemail'), (select acc from s18), (select sid from s18), 1, 'confirmed', null, null, repeat('2b', 32), 'email', now());

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.queue_recovery((select v from ids18 where k = 'orig'), 'S', 'I')$q$, 'user queues a recovery email', 'permission denied');
reset role;

set role service_role;
select pg_temp.eq((select count(*) from (select public.queue_recovery((select v from ids18 where k = 'orig'), 'Did we put it right?', 'Hi')) x where x.queue_recovery is not null), 0, 'not before the follow-up is resolved');
reset role;
update public.responses set followup_status = 'resolved', resolved_at = now() where id in ((select v from ids18 where k = 'orig'), (select v from ids18 where k = 'noemail'));
set role service_role;
insert into ids18 values ('send', public.queue_recovery((select v from ids18 where k = 'orig'), 'Did we put it right?', 'Hi'));
select pg_temp.eq((select count(*) from ids18 where k = 'send' and v is not null), 1, 'queued after resolving');
select pg_temp.eq((select count(*) from public.send_recipients where recovery_of = (select v from ids18 where k = 'orig') and email = 'sad@x.lk' and status = 'queued'), 1, 'recipient linked to the original rating');
select pg_temp.eq((select count(*) from (select public.queue_recovery((select v from ids18 where k = 'orig'), 'Again', 'Hi')) x where x.queue_recovery is not null), 0, 'only once per rating');
select pg_temp.eq((select count(*) from (select public.queue_recovery((select v from ids18 where k = 'noemail'), 'S', 'Hi')) x where x.queue_recovery is not null), 0, 'no email address, no recovery email');
select pg_temp.expect_fail($q$select public.queue_recovery((select v from ids18 where k = 'noemail'), E'Bad\nsubject', 'Hi')$q$, 'bad subject', 'invalid recovery text');

-- The answer links back to the original; a forged link to another rating is ignored.
insert into ids18 values ('ans', public.record_click((select sid from s18), 5::smallint, repeat('3c', 32), 'sad@x.lk', null, null, true, null, 'ua', 'email', null, (select v from ids18 where k = 'orig')));
select pg_temp.eq((select count(*) from public.responses where id = (select v from ids18 where k = 'ans') and recovery_of = (select v from ids18 where k = 'orig')), 1, 'answer linked to the original rating');
insert into ids18 values ('forged', public.record_click((select sid from s18), 5::smallint, repeat('4d', 32), 'x@x.lk', null, null, false, null, 'ua', 'email', null, (select v from ids18 where k = 'noemail')));
select pg_temp.eq((select count(*) from public.responses where id = (select v from ids18 where k = 'forged') and recovery_of is null), 1, 'link to a rating that got no recovery email is ignored');

-- API and recovery sends can share a day.
select public.api_send_one((select acc from s18), (select sid from s18), '{"email":"api18@x.lk"}', 0::smallint);
select pg_temp.eq((select count(*) from public.survey_sends where survey_id = (select sid from s18) and api_day = (now() at time zone 'utc')::date), 2, 'api and recovery sends side by side');
reset role;
