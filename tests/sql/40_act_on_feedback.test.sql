-- Drivers, follow-ups, notes, CES, survey settings validation.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function pg_temp.expect_fail(p_sql text, p_label text, p_reason text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_reason then
      raise exception 'TEST FAILED: % was blocked for the wrong reason: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception 'SECURITY TEST FAILED (should have been blocked): %', p_label;
end $$;
create or replace function pg_temp.eq(p_actual bigint, p_expected bigint, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual; end if;
end $$;
create or replace function pg_temp.eqt(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual; end if;
end $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal1')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.eqt(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- Fresh business D: owner, agent "Nimal", viewer, plus an outsider.
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000001', 'owner-d@example.com', '{"account_name":"Business D"}'),
  ('dddddddd-0000-0000-0000-000000000002', 'agent-d@example.com', '{"account_name":"x"}'),
  ('dddddddd-0000-0000-0000-000000000003', 'viewer-d@example.com', '{"account_name":"x"}');
create temp table d as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001';
grant select on d to authenticated, service_role;
update public.accounts set plan = 'growth' where id = (select acc from d); -- later suites use paid features
insert into public.memberships (account_id, user_id, role, agent_name)
  select acc, 'dddddddd-0000-0000-0000-000000000002', 'agent', 'Nimal' from d;
insert into public.memberships (account_id, user_id, role)
  select acc, 'dddddddd-0000-0000-0000-000000000003', 'viewer' from d;

-------------------------------------------------------------------------------
-- Survey settings validation (as owner, through RLS)
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into public.surveys (id, account_id, name, question, icon_set, created_by, drivers_positive, drivers_negative, review_cta_label, review_cta_url)
  select '5d000000-0000-0000-0000-000000000001', acc, 'Support', 'How did we do?', 'faces5', 'dddddddd-0000-0000-0000-000000000001',
         array['Fast', 'Friendly'], array['Slow reply', 'Not solved'], 'Review us on Google', 'https://g.page/r/example/review' from d;
insert into public.surveys (id, account_id, name, question, icon_set, created_by)
  select '5d000000-0000-0000-0000-000000000002', acc, 'Effort', 'How easy was it?', 'ces', 'dddddddd-0000-0000-0000-000000000001' from d;

select pg_temp.expect_fail($q$update public.surveys set drivers_positive = array['a','b','c','d','e','f','g','h','i'] where id = '5d000000-0000-0000-0000-000000000001'$q$, 'more than 8 drivers', 'surveys_drivers_check');
select pg_temp.expect_fail($q$update public.surveys set drivers_positive = array['Fast','fast'] where id = '5d000000-0000-0000-0000-000000000001'$q$, 'duplicate drivers', 'surveys_drivers_check');
select pg_temp.expect_fail($q$update public.surveys set drivers_negative = array[repeat('x', 41)] where id = '5d000000-0000-0000-0000-000000000001'$q$, 'driver too long', 'surveys_drivers_check');
select pg_temp.expect_fail($q$update public.surveys set review_cta_url = 'javascript:alert(1)' where id = '5d000000-0000-0000-0000-000000000001'$q$, 'javascript review link', 'surveys_review_cta_check');
select pg_temp.expect_fail($q$update public.surveys set review_cta_label = null where id = '5d000000-0000-0000-0000-000000000001'$q$, 'review url without label', 'surveys_review_cta_check');
select pg_temp.expect_fail($q$update public.surveys set followup_due_hours = 0 where id = '5d000000-0000-0000-0000-000000000001'$q$, 'zero due hours', 'surveys_followup_hours_check');
select pg_temp.expect_fail($q$update public.accounts set logo_path = 'accounts/x/evil.svg'$q$, 'user sets logo path', 'permission denied');
reset role;

-------------------------------------------------------------------------------
-- CES scale
-------------------------------------------------------------------------------
select pg_temp.eqt(public.rating_sentiment('ces', 7::smallint), 'positive', 'ces 7');
select pg_temp.eqt(public.rating_sentiment('ces', 5::smallint), 'positive', 'ces 5');
select pg_temp.eqt(public.rating_sentiment('ces', 4::smallint), 'neutral', 'ces 4');
select pg_temp.eqt(public.rating_sentiment('ces', 3::smallint), 'negative', 'ces 3');
set role service_role;
select pg_temp.expect_fail($q$select public.record_click('5d000000-0000-0000-0000-000000000002', 8::smallint, repeat('1',64), null, null, null, false, null, null)$q$, 'ces rating 8', 'rating out of range');

-------------------------------------------------------------------------------
-- Follow-ups open automatically for confirmed negative ratings
-------------------------------------------------------------------------------
create temp table neg as select public.record_click('5d000000-0000-0000-0000-000000000001', 2::smallint, repeat('2',64), 'unhappy@x.com', 'nimal', 'T-1', false, null, 'Mozilla') as id;
create temp table neg2 as select public.record_click('5d000000-0000-0000-0000-000000000001', 1::smallint, repeat('3',64), 'other@x.com', 'Kamal', 'T-2', false, null, 'Mozilla') as id;
create temp table pos as select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('4',64), 'happy@x.com', 'Nimal', 'T-3', false, null, 'Mozilla') as id;
select pg_temp.eq((select count(*) from public.responses where id = (select id from neg) and followup_status is null), 1, 'pending click has no follow-up');
select * from public.confirm_response((select id from neg));
select * from public.confirm_response((select id from neg2));
select * from public.confirm_response((select id from pos));
select pg_temp.eqt((select followup_status from public.responses where id = (select id from neg)), 'open', 'negative opens follow-up');
select pg_temp.eq((select count(*) from public.responses where id = (select id from neg) and due_at between now() + interval '47 hours' and now() + interval '49 hours'), 1, 'due in 48h');
select pg_temp.eq((select count(*) from public.responses where id = (select id from pos) and followup_status is null), 1, 'positive has no follow-up');

-------------------------------------------------------------------------------
-- Drivers must match the survey's lists for that sentiment
-------------------------------------------------------------------------------
update public.responses set drivers = array['Slow reply'] where id = (select id from neg);
select pg_temp.expect_fail($q$update public.responses set drivers = array['Fast'] where id = (select id from neg)$q$, 'positive driver on negative rating', 'invalid driver');
select pg_temp.expect_fail($q$update public.responses set drivers = array['<script>'] where id = (select id from pos)$q$, 'made-up driver', 'invalid driver');
update public.responses set drivers = array['Fast', 'Friendly'] where id = (select id from pos);
-- Customer changes their mind to a positive rating: earlier negative reasons are cleared.
select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('2',64), 'unhappy@x.com', 'nimal', 'T-1', false, null, 'Mozilla');
select * from public.confirm_response((select id from neg));
select pg_temp.eq((select cardinality(drivers) from public.responses where id = (select id from neg)), 0, 'reasons cleared on sentiment change');
select pg_temp.eqt((select followup_status from public.responses where id = (select id from neg)), 'open', 'follow-up stays for the team to close');
reset role;
grant select on neg, neg2, pos to authenticated;

-------------------------------------------------------------------------------
-- Follow-up permissions
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), 'resolved', null, null, false, false)$q$, 'viewer resolves', 'forbidden');
select pg_temp.expect_fail($q$select public.add_followup_note((select id from neg), 'hi')$q$, 'viewer adds note', 'forbidden');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- other business
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), 'resolved', null, null, false, false)$q$, 'outsider resolves', 'not found');
select pg_temp.expect_fail($q$select public.add_followup_note((select id from neg), 'hi')$q$, 'outsider adds note', 'not found');

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent Nimal
select pg_temp.expect_fail($q$select public.update_followup((select id from neg2), 'resolved', null, null, false, false)$q$, 'agent touches another agent''s rating', 'not found');
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), 'in_progress', null, null, false, false)$q$, 'agent updates unassigned follow-up', 'forbidden');

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), null, 'bbbbbbbb-0000-0000-0000-000000000001', null, true, false)$q$, 'assign to outsider', 'team member');
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), 'done', null, null, false, false)$q$, 'bad status', 'invalid status');
select pg_temp.expect_fail($q$select public.update_followup((select id from pos), 'resolved', null, null, false, false)$q$, 'follow-up on positive', 'no follow-up');
select public.update_followup((select id from neg), 'in_progress', 'dddddddd-0000-0000-0000-000000000002', now() + interval '1 day', true, true);
select public.add_followup_note((select id from neg), 'Called the customer, sending a replacement.');
select pg_temp.expect_fail($q$select public.add_followup_note((select id from neg), '   ')$q$, 'empty note', 'invalid note');

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent, now assignee
select public.update_followup((select id from neg), 'resolved', null, null, false, false);
select pg_temp.expect_fail($q$select public.update_followup((select id from neg), 'open', 'dddddddd-0000-0000-0000-000000000001', null, true, false)$q$, 'agent reassigns', 'forbidden');
select pg_temp.eq((select count(*) from public.followup_notes), 1, 'agent reads notes on own rating');
reset role;
select pg_temp.eq((select count(*) from public.responses where id = (select id from neg) and followup_status = 'resolved' and resolved_by = 'dddddddd-0000-0000-0000-000000000002' and resolved_at is not null), 1, 'resolved by agent recorded');

set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.followup_notes), 0, 'outsider sees no notes');
select pg_temp.expect_fail($q$insert into public.followup_notes (account_id, response_id, body) select acc, (select id from neg), 'x' from d$q$, 'direct note insert', 'permission denied');
select pg_temp.expect_fail($q$update public.responses set followup_status = 'resolved'$q$, 'direct status update', 'permission denied');
reset role;

select 'ALL ACT-ON-FEEDBACK TESTS PASSED' as result;
