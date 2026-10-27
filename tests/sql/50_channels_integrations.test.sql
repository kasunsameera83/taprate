-- Channels, kiosks, integrations.
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
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal1')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

-- Uses Business D from test 40 (owner dddd...0001, agent ...0002, viewer ...0003) and its survey 5d...0001.
create temp table d5 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d5 to authenticated, service_role;

-------------------------------------------------------------------------------
-- Channel
-------------------------------------------------------------------------------
set role service_role;
create temp table qr1 as select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('q',64), null, null, null, false, null, 'Mozilla', 'qr') as id;
select pg_temp.eq((select count(*) from public.responses where id = (select id from qr1) and channel = 'qr'), 1, 'channel stored');
select pg_temp.expect_fail($q$select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('z',64), null, null, null, false, null, null, 'kiosk')$q$, 'kiosk via click link', 'invalid channel');
select pg_temp.expect_fail($q$select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('z',64), null, null, null, false, null, null, 'evil')$q$, 'unknown channel', 'invalid channel');
create temp table em1 as select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('y',64), null, null, null, false, null, null) as id;
select pg_temp.eq((select count(*) from public.responses where id = (select id from em1) and channel = 'email'), 1, 'default channel is email');
reset role;

-------------------------------------------------------------------------------
-- Kiosks
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.create_kiosk((select acc from d5), '5d000000-0000-0000-0000-000000000001', 'Front desk', repeat('a',64))$q$, 'viewer creates kiosk', 'forbidden');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.expect_fail($q$select public.create_kiosk((select acc from d5), '5d000000-0000-0000-0000-000000000001', 'Front desk', repeat('a',64))$q$, 'outsider creates kiosk', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.create_kiosk((select acc from d5), '5d000000-0000-0000-0000-000000000001', 'Front desk', 'not-a-hash')$q$, 'bad token hash', 'invalid token');
select pg_temp.expect_fail($q$select public.create_kiosk((select acc from d5), '5b000000-0000-0000-0000-000000000001', 'Front desk', repeat('a',64))$q$, 'kiosk for another business''s survey', 'not found');
create temp table k1 as select public.create_kiosk((select acc from d5), '5d000000-0000-0000-0000-000000000001', 'Front desk', repeat('a',64)) as id;
select pg_temp.eq((select count(*) from public.kiosks), 1, 'owner sees kiosk');
select pg_temp.expect_fail($q$select token_hash from public.kiosks$q$, 'user reads kiosk token hash', 'permission denied');
reset role;
grant select on k1 to authenticated, service_role;

set role service_role;
create temp table kr1 as select public.record_kiosk_rating((select id from k1), repeat('a',64), 1::smallint, null, 'iPad') as id;
create temp table kr2 as select public.record_kiosk_rating((select id from k1), repeat('a',64), 1::smallint, null, 'iPad') as id;
select pg_temp.eq((select count(*) from public.responses where id in ((select id from kr1), (select id from kr2)) and channel = 'kiosk' and status = 'confirmed' and credited), 2, 'each kiosk tap is its own confirmed rating');
select pg_temp.eq((select count(*) from public.responses where id = (select id from kr1) and followup_status = 'open'), 1, 'negative kiosk rating opens follow-up');
select pg_temp.eq((select count(*) from (select public.record_kiosk_rating((select id from k1), repeat('b',64), 5::smallint, null, null) as id) x where id is null), 1, 'wrong kiosk token rejected');
select pg_temp.expect_fail($q$select public.record_kiosk_rating((select id from k1), repeat('a',64), 9::smallint, null, null)$q$, 'kiosk rating out of range', 'rating out of range');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.revoke_kiosk((select id from k1));
reset role;
set role service_role;
select pg_temp.eq((select count(*) from (select public.record_kiosk_rating((select id from k1), repeat('a',64), 5::smallint, null, null) as id) x where id is null), 1, 'revoked kiosk rejected');
reset role;
set role anon;
select pg_temp.expect_fail($q$select public.record_kiosk_rating(gen_random_uuid(), repeat('a',64), 5::smallint, null, null)$q$, 'anon calls kiosk function', 'permission denied');
reset role;

-------------------------------------------------------------------------------
-- Integrations: server-written only, secrets never readable by users
-------------------------------------------------------------------------------
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, events)
  select acc, 'slack', 'Support channel', 'v1.ciphertext', 'hooks.slack.com/…abcd', array['negative'] from d5;
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.integrations), 1, 'owner lists integrations');
select pg_temp.expect_fail($q$select url_encrypted from public.integrations$q$, 'owner reads encrypted url', 'permission denied');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) select acc, 'webhook', 'x', 'y', 'z' from d5$q$, 'user inserts integration', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent
select pg_temp.eq((select count(*) from public.integrations), 0, 'agent sees no integrations');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.integrations), 0, 'outsider sees no integrations');
reset role;
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, events) select acc, 'webhook', 'x', 'y', 'z', array['everything'] from d5$q$, 'unknown event', 'check constraint');

select 'ALL CHANNEL AND INTEGRATION TESTS PASSED' as result;
