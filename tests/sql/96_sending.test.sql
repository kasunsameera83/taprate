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

create temp table s13 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
create temp table out13 as select id as sid from public.surveys where id = '5b000000-0000-0000-0000-000000000001';
create temp table ids13 (k text primary key, v uuid);
grant select on s13, out13 to authenticated, service_role;
grant select, insert, update on ids13 to authenticated, service_role;
update public.surveys set status = 'active' where id = (select sid from s13);
update public.accounts set plan = 'trial', suspended_at = null where id = (select acc from s13);

-- Creating a send
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'viewer creates a send', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'agent creates a send', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from out13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'send for another business''s survey', 'not found');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"not-an-email"}]')$q$, 'bad email', 'invalid recipient');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk","role":"owner"}]')$q$, 'unknown field', 'invalid recipient');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk","name":"<b>x</b>"}]')$q$, 'markup in name', 'invalid recipient');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', E'Hi\nBcc: evil@x.com', '', null, null::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'header injection in subject', 'check');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', 'evil@x.com>', null::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'bad reply-to', 'check');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, 1::smallint, 30::smallint, '[{"email":"a@x.lk"}]')$q$, 'reminder too soon', 'check');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 30::smallint, (select jsonb_agg(jsonb_build_object('email', 'p' || g || '@x.lk')) from generate_series(1, 1001) g))$q$, 'more than 1000 recipients', 'invalid recipients');

insert into ids13 select 'send1', (public.create_survey_send((select acc from s13), (select sid from s13), 'October customers', 'How did we do?', 'Hi {name}', 'help@kova.lk', 3::smallint, 30::smallint,
  '[{"email":"Amaya@Gmail.com","name":"Amaya"},{"email":"amaya@gmail.com"},{"email":"ruwan@x.lk","ticket":"T-1"}]') ->> 'id')::uuid;
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send1')), 2, 'duplicates collapsed, emails lower-cased');
select pg_temp.eq((select count(*) from public.send_recipients where email = 'amaya@gmail.com' and name = 'Amaya'), 1, 'first row of a duplicate wins');
select pg_temp.expect_fail($q$insert into public.send_recipients (send_id, account_id, survey_id, email) values ((select v from ids13 where k = 'send1'), (select acc from s13), (select sid from s13), 'z@x.lk')$q$, 'owner inserts recipient directly', 'permission denied');
select pg_temp.expect_fail($q$update public.send_recipients set status = 'sent'$q$, 'owner edits recipient directly', 'permission denied');
select pg_temp.expect_fail($q$select * from public.claim_send_batch(null, 10)$q$, 'user claims queue', 'permission denied');
select pg_temp.expect_fail($q$select public.unsubscribe_recipient((select id from public.send_recipients limit 1))$q$, 'user unsubscribes someone', 'permission denied');
select pg_temp.expect_fail($q$select public.suppress_globally('a@x.lk', 'bounced')$q$, 'user adds global bounce', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer can read
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send1')), 2, 'viewer reads recipients');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent cannot
select pg_temp.eq((select count(*) from public.send_recipients), 0, 'agent cannot read customer lists');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.eq((select count(*) from public.survey_sends), 0, 'outsider reads no sends');
reset role;

-- Queue: claim, send, cooldown, unsubscribe
set role service_role;
select pg_temp.eq((select count(*) from public.claim_send_batch((select v from ids13 where k = 'send1'), 50)), 2, 'server claims queued recipients');
select pg_temp.eq((select count(*) from public.claim_send_batch((select v from ids13 where k = 'send1'), 50)), 0, 'claimed rows are not claimed twice');
update public.send_recipients set status = 'sent', sent_at = now() where send_id = (select v from ids13 where k = 'send1');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into ids13 select 'send2', (public.create_survey_send((select acc from s13), (select sid from s13), 'Again', 'How did we do?', '', null, null::smallint, 30::smallint,
  '[{"email":"amaya@gmail.com"},{"email":"new@x.lk"}]') ->> 'id')::uuid;
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send2') and status = 'skipped_recent'), 1, 'recently emailed person skipped');
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send2') and status = 'queued'), 1, 'new person queued');
reset role;

set role service_role;
select public.unsubscribe_recipient((select id from public.send_recipients where send_id = (select v from ids13 where k = 'send1') and email = 'ruwan@x.lk'));
select public.suppress_globally('NEW@x.lk', 'bounced');
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send2') and email = 'new@x.lk' and status = 'suppressed'), 1, 'bounce stops a queued email');
select pg_temp.eq((select count(*) from public.claim_send_batch((select v from ids13 where k = 'send2'), 50)), 0, 'nothing left to send');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into ids13 select 'send3', (public.create_survey_send((select acc from s13), (select sid from s13), 'Third', 'Hi', '', null, null::smallint, 0::smallint,
  '[{"email":"ruwan@x.lk"},{"email":"new@x.lk"},{"email":"third@x.lk"}]') ->> 'id')::uuid;
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send3') and status = 'suppressed'), 2, 'unsubscribed and bounced people are never queued');
select pg_temp.eq((select count(*) from public.email_suppressions), 1, 'team sees its unsubscribes, not the shared bounce list');
select pg_temp.expect_fail($q$delete from public.email_suppressions$q$, 'team deletes an unsubscribe', 'permission denied');
select pg_temp.eq(public.remove_suppression((select acc from s13), 'ruwan@x.lk'), 0, 'a customer''s own unsubscribe can''t be removed');
select public.add_suppression((select acc from s13), 'third@x.lk');
select pg_temp.eq((select count(*) from public.send_recipients where send_id = (select v from ids13 where k = 'send3') and email = 'third@x.lk' and status = 'suppressed'), 1, 'team-added suppression stops the queued email');
select pg_temp.eq(public.remove_suppression((select acc from s13), 'third@x.lk'), 1, 'team can remove what it added');
reset role;

-- Daily limit for trials (100 a day)
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into ids13 select 'big', (public.create_survey_send((select acc from s13), (select sid from s13), 'Big', 'Hi', '', null, null::smallint, 0::smallint,
  (select jsonb_agg(jsonb_build_object('email', 'bulk' || g || '@x.lk')) from generate_series(1, 150) g)) ->> 'id')::uuid;
select pg_temp.eq((select count(*) from public.send_recipients where account_id = (select acc from s13) and status in ('queued', 'sending', 'sent', 'failed') and created_at >= date_trunc('day', now())), 100, 'trial capped at 100 a day');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'More', 'Hi', '', null, null::smallint, 0::smallint, '[{"email":"more@x.lk"}]')$q$, 'over the daily limit', 'daily send limit');
reset role;

-- Reminders: due only for people who haven't rated
set role service_role;
update public.send_recipients set sent_at = now() - interval '4 days' where send_id = (select v from ids13 where k = 'send1');
select pg_temp.eq((select count(*) from public.reminders_due(100) where send_id = (select v from ids13 where k = 'send1')), 1, 'reminder due for amaya only (ruwan unsubscribed)');
insert into public.responses (account_id, survey_id, rating, status, respondent_email, metadata_verified, dedupe_key, channel, confirmed_at)
  values ((select acc from s13), (select sid from s13), 5, 'confirmed', 'amaya@gmail.com', true, repeat('m', 64), 'email', now());
select pg_temp.eq((select count(*) from public.reminders_due(100) where send_id = (select v from ids13 where k = 'send1')), 0, 'no reminder after a rating');
select pg_temp.eq((select rated from public.send_summaries((select acc from s13), array[(select v from ids13 where k = 'send1')])), 1, 'summary counts the rating');
select pg_temp.eq((select count(*) from public.send_summaries((select acc from s13), array[(select v from ids13 where k = 'send1')]) where send_id is not null and (select acc from s13) is not null), 1, 'summary scoped to the business');

-- API send: one row per survey per day; duplicates answered without a second email
select pg_temp.expect_fail($q$select public.api_send_one((select acc from s13), (select sid from s13), '{"email":"api@x.lk"}', 0::smallint)$q$, 'api send over the trial limit', 'daily send limit');
reset role;
update public.accounts set plan = 'growth' where id = (select acc from s13);
set role service_role;
select pg_temp.eq(((public.api_send_one((select acc from s13), (select sid from s13), '{"email":"api2@x.lk"}', 0::smallint)) ->> 'status' = 'queued')::int, 1, 'api recipient queued');
select pg_temp.eq(((public.api_send_one((select acc from s13), (select sid from s13), '{"email":"API2@x.lk"}', 0::smallint)) ->> 'status' = 'duplicate')::int, 1, 'api duplicate same day');
select pg_temp.eq((select count(*) from public.survey_sends where survey_id = (select sid from s13) and source = 'api'), 1, 'one api send row per day');
select pg_temp.expect_fail($q$select public.api_send_one((select acc from s13), (select sid from out13), '{"email":"x@x.lk"}', 0::smallint)$q$, 'api send to another business''s survey', 'not found');

-- Cancel: owner only, removes what hasn't gone yet
reset role;
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003');
select pg_temp.expect_fail($q$select public.cancel_survey_send((select v from ids13 where k = 'big'))$q$, 'viewer cancels', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq(public.cancel_survey_send((select v from ids13 where k = 'big')), 98, 'cancel removes queued recipients (98 fitted under the limit)');
reset role;

-- Erasing a customer removes them from lists but keeps the unsubscribe.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.erase_customer_data((select acc from s13), 'ruwan@x.lk');
select pg_temp.eq((select count(*) from public.send_recipients where email = 'ruwan@x.lk'), 0, 'erased from send lists');
select pg_temp.eq((select count(*) from public.email_suppressions where email = 'ruwan@x.lk'), 1, 'unsubscribe kept after erasure');
reset role;

-- Suspended business can't send.
update public.accounts set suspended_at = now() where id = (select acc from s13);
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.create_survey_send((select acc from s13), (select sid from s13), 'x', 'Hi', '', null, null::smallint, 0::smallint, '[{"email":"s@x.lk"}]')$q$, 'suspended business sends', 'suspended');
reset role;
update public.accounts set suspended_at = null where id = (select acc from s13);
