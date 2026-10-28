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

create temp table s16 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
create temp table ids16 (k text primary key, v uuid);
grant select on s16 to authenticated, service_role;
grant select, insert on ids16 to authenticated, service_role;

-- A happy rating with a comment, and an unhappy one.
insert into ids16 values ('happy', gen_random_uuid()), ('sad', gen_random_uuid());
insert into public.responses (id, account_id, survey_id, rating, status, comment, dedupe_key, channel, confirmed_at)
  values ((select v from ids16 where k = 'happy'), (select acc from s16), (select sid from s16), 5, 'confirmed', 'Lovely people', repeat('w', 64), 'email', now()),
         ((select v from ids16 where k = 'sad'), (select acc from s16), (select sid from s16), 1, 'confirmed', 'Slow', repeat('x', 64), 'email', now());

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.feature_response((select v from ids16 where k = 'happy'), true)$q$, 'feature without the customer''s consent', 'not shareable');
reset role;
set role service_role;
update public.responses set share_consent = true, display_name = 'Amaya' where id in ((select v from ids16 where k = 'happy'), (select v from ids16 where k = 'sad'));
select pg_temp.expect_fail($q$update public.responses set display_name = 'a@b.lk' where id = (select v from ids16 where k = 'happy')$q$, 'email as display name', 'check');
reset role;

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.feature_response((select v from ids16 where k = 'happy'), true)$q$, 'viewer features', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.feature_response((select v from ids16 where k = 'sad'), true)$q$, 'feature an unhappy comment', 'not shareable');
select public.feature_response((select v from ids16 where k = 'happy'), true);
select pg_temp.eq((select count(*) from public.responses where id = (select v from ids16 where k = 'happy') and featured_at is not null), 1, 'owner features a consented happy comment');
select pg_temp.expect_fail($q$update public.responses set featured_at = now() where id = (select v from ids16 where k = 'sad')$q$, 'feature directly', 'permission denied');
reset role;

set role service_role;
update public.responses set comment = 'Edited later' where id = (select v from ids16 where k = 'happy');
select pg_temp.eq((select count(*) from public.responses where id = (select v from ids16 where k = 'happy') and featured_at is null), 1, 'edited comment needs approving again');
reset role;
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.feature_response((select v from ids16 where k = 'happy'), true);
reset role;
set role service_role;
update public.responses set share_consent = false where id = (select v from ids16 where k = 'happy');
select pg_temp.eq((select count(*) from public.responses where id = (select v from ids16 where k = 'happy') and featured_at is null and display_name is null), 1, 'withdrawn consent un-features and removes the name');
reset role;

-- TV screens
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.create_tv_screen((select acc from s16), 'Office', repeat('c', 64), null, null, false)$q$, 'viewer makes a TV screen', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
select pg_temp.expect_fail($q$select public.create_tv_screen((select acc from s16), 'Office', repeat('c', 64), '5b000000-0000-0000-0000-000000000001', null, false)$q$, 'TV for another business''s survey', 'not found');
insert into ids16 values ('tv', public.create_tv_screen((select acc from s16), 'Office', repeat('c', 64), null, null, true));
select pg_temp.expect_fail($q$select token_hash from public.tv_screens$q$, 'read the token hash', 'permission denied');
select pg_temp.eq((select count(*) from public.tv_screens where id = (select v from ids16 where k = 'tv')), 1, 'owner sees the screen');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.expect_fail($q$select public.revoke_tv_screen((select v from ids16 where k = 'tv'))$q$, 'outsider switches off a screen', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.revoke_tv_screen((select v from ids16 where k = 'tv'));
select pg_temp.eq((select count(*) from public.tv_screens where id = (select v from ids16 where k = 'tv') and revoked_at is not null), 1, 'screen switched off');
reset role;
