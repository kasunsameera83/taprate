-- More integrations (0023): new kinds allowed, Shopify needs a survey from the same business, users can't
-- read secrets or write the table.
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

create temp table s23 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
grant select on s23 to authenticated, service_role;

insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from s23), 'gorgias', 'Gorgias', 'v1.x.y.z', 'acme.gorgias.com');
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from s23), 'intercom', 'Intercom', 'v1.x.y.z', 'api.intercom.io');
insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, secret_encrypted, survey_id) values ((select acc from s23), 'shopify', 'Shop', 'v1.x.y.z', 'acme.myshopify.com', 'v1.s', (select sid from s23));
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint) values ((select acc from s23), 'shopify', 'S', 'v1', 'x')$q$, 'shopify without a survey', 'integrations_survey_kind');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, survey_id) values ((select acc from s23), 'slack', 'S', 'v1', 'x', (select sid from s23))$q$, 'survey on a non-shopify kind', 'integrations_survey_kind');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, survey_id) values ((select acc from s23), 'shopify', 'S', 'v1', 'x', '5b000000-0000-0000-0000-000000000001')$q$, 'another business''s survey', 'survey not found');
select pg_temp.expect_fail($q$update public.integrations set survey_id = '5b000000-0000-0000-0000-000000000001' where kind = 'shopify' and account_id = (select acc from s23)$q$, 'switch to another business''s survey', 'survey not found');

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.integrations where kind in ('gorgias', 'intercom', 'shopify') and survey_id is not distinct from survey_id), 3, 'owner lists new integrations');
select pg_temp.expect_fail($q$select secret_encrypted from public.integrations$q$, 'owner reads secret', 'permission denied');
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, survey_id) values ((select acc from s23), 'shopify', 'S', 'v1', 'x', (select sid from s23))$q$, 'owner writes directly', 'permission denied');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003');
select pg_temp.eq((select count(*) from public.integrations), 0, 'viewer sees none');
reset role;

delete from public.integrations where kind in ('gorgias', 'intercom', 'shopify');
