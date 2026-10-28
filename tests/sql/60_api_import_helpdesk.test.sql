-- API keys, CSV import, helpdesk integration kinds.
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

-- Business D from test 40: owner dddd...0001, agent ...0002, viewer ...0003; survey 5d...0001 (faces5, follow-ups on).
create temp table d6 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on d6 to authenticated, service_role;

-------------------------------------------------------------------------------
-- API keys
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['read'], repeat('a',64), null)$q$, 'viewer creates key', 'forbidden');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['read'], repeat('a',64), null)$q$, 'outsider creates key', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['write'], repeat('a',64), null)$q$, 'write without read', 'invalid scopes');
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['read','admin'], repeat('a',64), null)$q$, 'unknown scope', 'invalid scopes');
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['read'], 'short', null)$q$, 'bad hash', 'invalid token');
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), 'CRM', array['read'], repeat('a',64), now() + interval '5 years')$q$, 'expiry too far', 'invalid expiry');
select pg_temp.expect_fail($q$select public.create_api_key((select acc from d6), '  ', array['read'], repeat('a',64), null)$q$, 'blank name', 'invalid name');
create temp table key1 as select public.create_api_key((select acc from d6), 'CRM', array['write','read','read'], repeat('a',64), now() + interval '90 days') as id;
select pg_temp.eq((select count(*) from public.api_keys where scopes = array['read','write']), 1, 'scopes de-duplicated and sorted');
select pg_temp.expect_fail($q$select token_hash from public.api_keys$q$, 'user reads key hash', 'permission denied');
select pg_temp.expect_fail($q$insert into public.api_keys (account_id, name, token_hash, scopes) values ((select acc from d6), 'x', repeat('b',64), array['read'])$q$, 'user inserts key directly', 'permission denied');
select pg_temp.expect_fail($q$update public.api_keys set revoked_at = null$q$, 'user edits key directly', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer can't list keys
select pg_temp.eq((select count(*) from public.api_keys), 0, 'viewer sees no keys');
reset role;
grant select on key1 to authenticated, service_role;

set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.revoke_api_key((select id from key1))$q$, 'outsider revokes key', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.revoke_api_key((select id from key1));
select pg_temp.eq((select count(*) from public.api_keys where revoked_at is not null), 1, 'owner revoked key');
reset role;

-------------------------------------------------------------------------------
-- CSV import
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":5}]')$q$, 'viewer imports', 'forbidden');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":5}]')$q$, 'outsider imports', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5b000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":1}]')$q$, 'import into another business''s survey', 'not found');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[]')$q$, 'empty import', 'invalid row count');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '{"rating":1}')$q$, 'not an array', 'invalid rows');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":5,"status":"pending"}]')$q$, 'extra field', 'invalid import row');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"02/01/2025","rating":5}]')$q$, 'ambiguous date format', 'invalid import row');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2099-01-02T10:00:00Z","rating":5}]')$q$, 'future date', 'invalid import date');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":"5"}]')$q$, 'rating as text', 'invalid import row');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":9}]')$q$, 'rating outside scale', 'rating out of range');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":5,"email":"nope"}]')$q$, 'bad email', 'invalid import row');
select pg_temp.expect_fail($q$select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'a.csv', '[{"date":"2025-01-02T10:00:00Z","rating":5,"ticket":"1 OR 1=1"}]')$q$, 'bad ticket', 'invalid import row');
select pg_temp.eq((select count(*) from public.import_batches), 0, 'failed imports leave no batch');

create temp table imp1 as select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'history.csv',
  '[{"date":"2025-01-02T10:00:00Z","rating":1,"email":"Old@Example.com","comment":"Slow","agent":"Nimal","ticket":"T-1"},
    {"date":"2025-01-03T10:00:00Z","rating":5},
    {"date":"2025-01-03T10:00:00Z","rating":5}]'::jsonb) as r;
reset role;
grant select on imp1 to authenticated, service_role;

select pg_temp.eq(((select r from imp1) ->> 'inserted')::bigint, 2, 'two rows imported');
select pg_temp.eq(((select r from imp1) ->> 'skipped')::bigint, 1, 'duplicate row in file skipped');
select pg_temp.eq((select count(*) from public.responses where import_batch = ((select r from imp1) ->> 'batch')::uuid and channel = 'import' and status = 'confirmed' and not credited), 2, 'imported as confirmed, not charged');
select pg_temp.eq((select count(*) from public.responses where respondent_email = 'old@example.com' and sentiment = 'negative' and followup_status is null and created_at = '2025-01-02T10:00:00Z'), 1, 'old negative: sentiment set, no follow-up, original date kept');

-- Importing the same rows again adds nothing.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
create temp table imp2 as select public.import_responses((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'history.csv',
  '[{"date":"2025-01-02T10:00:00Z","rating":1,"email":"old@example.com","comment":"Slow","agent":"Nimal","ticket":"T-1"}]'::jsonb) as r;
select pg_temp.eq(((select r from imp2) ->> 'inserted')::bigint, 0, 're-import skipped');
select pg_temp.expect_fail($q$insert into public.import_batches (account_id, survey_id, file_name) values ((select acc from d6), '5d000000-0000-0000-0000-000000000001', 'x')$q$, 'user writes batch directly', 'permission denied');

-- Undo
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.delete_import(((select r from imp1) ->> 'batch')::uuid)$q$, 'outsider undoes import', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq(public.delete_import(((select r from imp1) ->> 'batch')::uuid), 2, 'undo reports rows removed');
reset role;
select pg_temp.eq((select count(*) from public.responses where respondent_email = 'old@example.com'), 0, 'undo removed the ratings');

-- Ordinary channels still can't claim to be imports.
set role service_role;
select pg_temp.expect_fail($q$select public.record_click('5d000000-0000-0000-0000-000000000001', 5::smallint, repeat('i',64), null, null, null, false, null, null, 'import')$q$, 'import via click link', 'invalid channel');
reset role;

-------------------------------------------------------------------------------
-- Helpdesk kinds
-------------------------------------------------------------------------------
set role service_role;
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from d6), 'zendesk', 'Zendesk', 'v1.x.y.z', 'acme.zendesk.com');
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from d6), 'freshdesk', 'Freshdesk', 'v1.x.y.z', 'acme.freshdesk.com');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from d6), 'jira', 'J', 'v1', 'x')$q$, 'unknown integration kind', 'integrations_kind_check');
delete from public.integrations where kind in ('zendesk', 'freshdesk');
reset role;
