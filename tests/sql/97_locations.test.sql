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

create temp table s14 as select id as sid, account_id as acc from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
create temp table out14 as select id as sid, account_id as acc from public.surveys where id = '5b000000-0000-0000-0000-000000000001';
create temp table loc14 (k text primary key, v uuid);
grant select on s14, out14 to authenticated, service_role;
grant select, insert on loc14 to authenticated, service_role;
update public.surveys set status = 'active' where id = (select sid from s14);
update public.accounts set suspended_at = null, credit_balance = 1000 where id = (select acc from s14);

set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
select pg_temp.expect_fail($q$select public.create_location((select acc from s14), 'Kandy')$q$, 'viewer adds a branch', 'forbidden');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001'); -- owner
insert into loc14 values ('kandy', public.create_location((select acc from s14), 'Kandy'));
insert into loc14 values ('galle', public.create_location((select acc from s14), ' Galle Fort '));
select pg_temp.expect_fail($q$select public.create_location((select acc from s14), 'kandy')$q$, 'duplicate branch name', 'duplicate|unique');
select pg_temp.expect_fail($q$select public.create_location((select acc from s14), '<b>x</b>')$q$, 'markup in name', 'invalid location name');
select pg_temp.expect_fail($q$insert into public.locations (account_id, name) values ((select acc from s14), 'Direct')$q$, 'direct insert', 'permission denied');
select pg_temp.eq((select count(*) from public.locations where name = 'Galle Fort'), 1, 'name trimmed');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002'); -- agent can read names
select pg_temp.eq((select count(*) from public.locations), 2, 'team members see branch names');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- outsider
select pg_temp.eq((select count(*) from public.locations where account_id = (select acc from s14)), 0, 'outsider sees no branches');
select pg_temp.expect_fail($q$select public.update_location((select v from loc14 where k = 'kandy'), 'Mine now', false)$q$, 'outsider renames a branch', 'forbidden');
reset role;

-- Clicks: a branch from the same business is kept; another business's branch is dropped.
insert into public.locations (account_id, name) values ((select acc from out14), 'Elsewhere');
insert into loc14 select 'else', id from public.locations where name = 'Elsewhere';
set role service_role;
insert into loc14 values ('r1', public.record_click((select sid from s14), 5::smallint, repeat('l', 64), null, null, null, false, null, 'ua', 'qr', (select v from loc14 where k = 'kandy')));
select pg_temp.eq((select count(*) from public.responses r where r.id = (select v from loc14 where k = 'r1') and r.location_id = (select v from loc14 where k = 'kandy')), 1, 'qr click tagged with its branch');
insert into loc14 values ('r2', public.record_click((select sid from s14), 5::smallint, repeat('k', 64), null, null, null, false, null, 'ua', 'qr', (select v from loc14 where k = 'else')));
select pg_temp.eq((select count(*) from public.responses r where r.id = (select v from loc14 where k = 'r2') and r.location_id is null), 1, 'another business''s branch is dropped');
select pg_temp.expect_fail($q$update public.responses set location_id = (select v from loc14 where k = 'else') where dedupe_key = repeat('l', 64)$q$, 'move rating to another business''s branch', 'invalid location');
reset role;

-- Archived branches stop tagging new ratings but keep old ones.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select public.update_location((select v from loc14 where k = 'galle'), 'Galle Fort', true);
reset role;
set role service_role;
insert into loc14 values ('r3', public.record_click((select sid from s14), 4::smallint, repeat('j', 64), null, null, null, false, null, 'ua', 'qr', (select v from loc14 where k = 'galle')));
select pg_temp.eq((select count(*) from public.responses r where r.id = (select v from loc14 where k = 'r3') and r.location_id is null), 1, 'archived branch not used for new ratings');
reset role;

-- Kiosks
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.create_kiosk((select acc from s14), (select sid from s14), 'Front desk', repeat('a', 64), (select v from loc14 where k = 'else'))$q$, 'kiosk with another business''s branch', 'invalid location');
insert into loc14 values ('kiosk', public.create_kiosk((select acc from s14), (select sid from s14), 'Kandy desk', repeat('b', 64), (select v from loc14 where k = 'kandy')));
select pg_temp.eq((select count(*) from public.kiosks where id = (select v from loc14 where k = 'kiosk') and location_id = (select v from loc14 where k = 'kandy')), 1, 'kiosk keeps its branch');
reset role;
set role service_role;
insert into loc14 values ('r4', public.record_kiosk_rating((select v from loc14 where k = 'kiosk'), repeat('b', 64), 5::smallint, null, 'ua'));
select pg_temp.eq((select count(*) from public.responses r where r.id = (select v from loc14 where k = 'r4') and r.location_id = (select v from loc14 where k = 'kandy')), 1, 'kiosk rating tagged with its branch');
reset role;
