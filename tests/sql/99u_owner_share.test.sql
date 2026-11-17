-- 0041 owner-confirmed share permission: only owners/admins (with two-step done) of the same business, only
-- happy confirmed comments, nobody writes the columns directly, and an edited comment needs permission again.
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
create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'TEST FAILED: %', p_label; end if;
end $$;
create or replace function pg_temp.as_user(p_user text, p_aal text default 'aal2') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', p_aal)::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.ok(boolean, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text, text) to authenticated, service_role;

-- A happy comment in business D (owner dddd…0001, agent …0002, viewer …0003) and one in another business.
create temp table r41 as
  select r.id, r.account_id from public.responses r
  join public.memberships m on m.account_id = r.account_id and m.user_id = 'dddddddd-0000-0000-0000-000000000001' and m.role = 'owner'
  limit 1;
update public.responses set status = 'confirmed', sentiment = 'positive', comment = 'Lovely service', rating = coalesce(rating, 5) where id = (select id from r41);
create temp table other41 as select gen_random_uuid() as id; -- not a response this owner can see
grant select on r41, other41 to authenticated, service_role;
select pg_temp.ok((select count(*) from r41) = 1 and (select count(*) from other41) = 1, 'test rows exist');

set role authenticated;
-- Agent and viewer can't.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000002');
select pg_temp.expect_fail($q$select public.set_owner_share_permission((select id from r41), true)$q$, 'agent sets permission', 'forbidden|permission');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003');
select pg_temp.expect_fail($q$select public.set_owner_share_permission((select id from r41), true)$q$, 'viewer sets permission', 'forbidden|permission');
-- (An owner who has turned on two-step sign-in must also have entered the code: mfa_ok, as everywhere else.)
-- Owner can't touch another business's comment.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.set_owner_share_permission((select id from other41), true)$q$, 'other business', 'forbidden|permission|not found');
-- Nobody writes the columns directly.
select pg_temp.expect_fail($q$update public.responses set owner_share_at = now() where id = (select id from r41)$q$, 'direct write', 'permission denied');
-- Owner can.
select public.set_owner_share_permission((select id from r41), true);
reset role;
select pg_temp.ok((select owner_share_at is not null and owner_share_by = 'dddddddd-0000-0000-0000-000000000001' from public.responses where id = (select id from r41)), 'permission recorded with who');

-- Editing the comment drops it.
update public.responses set comment = 'Lovely service, thanks' where id = (select id from r41);
select pg_temp.ok((select owner_share_at is null and owner_share_by is null from public.responses where id = (select id from r41)), 'edited comment needs permission again');

-- Not for unhappy ratings.
update public.responses set sentiment = 'negative' where id = (select id from r41);
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.set_owner_share_permission((select id from r41), true)$q$, 'unhappy rating', 'not shareable');
reset role;
update public.responses set sentiment = 'positive' where id = (select id from r41);
