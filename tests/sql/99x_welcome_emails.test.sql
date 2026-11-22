-- 0044 welcome emails: candidates list, once-only claims, opt-out, and nobody but the server can touch it.
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
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', 'aal2')::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, anon, service_role;
grant execute on function pg_temp.ok(boolean, text) to authenticated, anon, service_role;
grant execute on function pg_temp.as_user(text) to authenticated, service_role;

create temp table a44 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a44 to authenticated, anon, service_role;
create temp table keep44 as select created_at from public.accounts where id = (select acc from a44);
update public.accounts set created_at = now() - interval '2 days' where id = (select acc from a44);

set role service_role;
create temp table c44 as select * from public.lifecycle_candidates(2000) where account_id = (select acc from a44);
reset role;
select pg_temp.ok((select count(*) from c44) = 1, 'new business is a candidate');
select pg_temp.ok((select surveys from c44) >= 0 and (select ratings from c44) >= 0, 'counts present');
select pg_temp.ok((select sent from c44) = '{}', 'nothing sent yet');

-- Claim once; the second claim does nothing.
set role service_role;
insert into public.lifecycle_emails (account_id, kind) values ((select acc from a44), 'setup');
select pg_temp.expect_fail($q$insert into public.lifecycle_emails (account_id, kind) values ((select acc from a44), 'setup')$q$, 'second claim', 'duplicate key');
select pg_temp.expect_fail($q$insert into public.lifecycle_emails (account_id, kind) values ((select acc from a44), 'spam')$q$, 'unknown kind', 'check');
reset role;
set role service_role;
create temp table c44b as select * from public.lifecycle_candidates(2000) where account_id = (select acc from a44);
reset role;
select pg_temp.ok((select sent from c44b) = array['setup'], 'claim shows as sent');

-- Old businesses aren't candidates.
update public.accounts set created_at = now() - interval '40 days' where id = (select acc from a44);
set role service_role;
select pg_temp.ok((select count(*) from public.lifecycle_candidates(2000) where account_id = (select acc from a44)) = 0, 'older than 30 days is skipped');
reset role;

-- Opt-out.
set role service_role;
select pg_temp.ok(public.tips_opt_out('dddddddd-0000-0000-0000-000000000001') >= 1, 'opt-out updates memberships');
reset role;
select pg_temp.ok((select bool_and(tips_opt_out) from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001'), 'opted out everywhere');

-- Nobody else can read the table or call the functions.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select count(*) from public.lifecycle_emails$q$, 'user reads lifecycle_emails', 'permission denied');
select pg_temp.expect_fail($q$select public.lifecycle_candidates(10)$q$, 'user lists candidates', 'permission denied');
select pg_temp.expect_fail($q$select public.tips_opt_out('dddddddd-0000-0000-0000-000000000002')$q$, 'user opts someone out', 'permission denied');
select pg_temp.expect_fail($q$update public.memberships set tips_opt_out = false where user_id = 'dddddddd-0000-0000-0000-000000000001'$q$, 'user flips opt-out directly', 'permission denied');
reset role;
set role anon;
select pg_temp.expect_fail($q$select public.lifecycle_candidates(10)$q$, 'anon lists candidates', 'permission denied');
reset role;

-- Put the test business back.
update public.memberships set tips_opt_out = false where user_id = 'dddddddd-0000-0000-0000-000000000001';
delete from public.lifecycle_emails where account_id = (select acc from a44);
update public.accounts a set created_at = k.created_at from keep44 k where a.id = (select acc from a44);
