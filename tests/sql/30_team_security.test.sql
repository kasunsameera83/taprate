-- Team, invites, agent visibility, two-factor enforcement, privacy tools.
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
  if p_actual is distinct from p_expected then
    raise exception 'TEST FAILED: % (expected %, got %)', p_label, p_expected, p_actual;
  end if;
end $$;
create or replace function pg_temp.as_user(p_user text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'aal', p_aal)::text, false);
$$;
grant execute on function pg_temp.expect_fail(text, text, text) to authenticated, service_role;
grant execute on function pg_temp.eq(bigint, bigint, text) to authenticated, service_role;
grant execute on function pg_temp.as_user(text, text) to authenticated, service_role;

-- Owner A = aaaaaaaa-...-0001 (from test 10), viewer A = aaaaaaaa-...-0002, owner B = bbbbbbbb-...-0001.
create temp table t3 as
select (select account_id from public.memberships where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and role = 'owner') as acc_a,
       (select account_id from public.memberships where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' and role = 'owner') as acc_b;
grant select on t3 to authenticated, service_role;

-------------------------------------------------------------------------------
-- Invites
-------------------------------------------------------------------------------
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- viewer
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'x@example.com', 'viewer', null)$q$, 'viewer invites', 'forbidden');
select pg_temp.expect_fail($q$select * from public.account_members((select acc_a from t3))$q$, 'viewer lists member emails', 'forbidden');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001'); -- owner of B
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'x@example.com', 'viewer', null)$q$, 'other business invites into A', 'forbidden');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001'); -- owner A
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'not-an-email', 'viewer', null)$q$, 'bad email', 'invalid email');
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'x@example.com', 'owner', null)$q$, 'invite as owner', 'invalid role');
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'x@example.com', 'agent', '  ')$q$, 'agent without name', 'agent name required');
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'viewer-a@example.com', 'viewer', null)$q$, 'invite existing member', 'already a member');
create temp table inv as select public.create_invite((select acc_a from t3), '  Agent.Kasun@Example.com ', 'agent', 'Kasun') as id;
select pg_temp.eq((select count(*) from public.invites where email = 'agent.kasun@example.com' and status = 'pending'), 1, 'invite stored lower-case');
select pg_temp.eq((select count(*) from public.account_members((select acc_a from t3))), 2, 'owner lists members');
reset role;

-- Invitee signs up: no empty account is created for them.
insert into auth.users (id, email, email_confirmed_at) values ('cccccccc-0000-0000-0000-000000000001', 'agent.kasun@example.com', null);
select pg_temp.eq((select count(*) from public.memberships where user_id = 'cccccccc-0000-0000-0000-000000000001'), 0, 'invited signup gets no own account');

set role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.my_invites()), 0, 'unconfirmed email sees no invites');
select pg_temp.expect_fail($q$select public.accept_invite((select id from inv))$q$, 'accept before confirming email', 'invite not found');
reset role;
update auth.users set email_confirmed_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';

-- Someone else cannot accept it.
set role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.accept_invite((select id from inv))$q$, 'accept someone else''s invite', 'invite not found');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.my_invites()), 1, 'confirmed invitee sees invite');
select public.accept_invite((select id from inv));
select pg_temp.eq((select count(*) from public.memberships where user_id = 'cccccccc-0000-0000-0000-000000000001' and role = 'agent'), 1, 'agent joined');
select pg_temp.expect_fail($q$select public.accept_invite((select id from inv))$q$, 'accept twice', 'no longer valid');

-------------------------------------------------------------------------------
-- Agent sees only their own responses
-------------------------------------------------------------------------------
reset role;
set role service_role;
create temp table r_k as select public.record_click('5a000000-0000-0000-0000-000000000001', 5::smallint, repeat('k',64), 'c1@x.com', 'kasun', 'T-9', false, null, 'Mozilla') as id;
select * from public.confirm_response((select id from r_k));
reset role;
set role authenticated;
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.responses), 1, 'agent sees only own (case-insensitive) responses');
select pg_temp.eq((select count(*) from public.responses where agent = 'kasun'), 1, 'it is the matching one');
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'y@example.com', 'viewer', null)$q$, 'agent invites', 'forbidden');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.responses), 3, 'owner sees all responses');

-------------------------------------------------------------------------------
-- Member management rules
-------------------------------------------------------------------------------
select pg_temp.expect_fail($q$select public.update_member((select acc_a from t3), 'aaaaaaaa-0000-0000-0000-000000000001', 'viewer', null)$q$, 'demote last owner', 'at least one owner');
select pg_temp.expect_fail($q$select public.remove_member((select acc_a from t3), 'aaaaaaaa-0000-0000-0000-000000000001')$q$, 'remove last owner', 'at least one owner');
select public.update_member((select acc_a from t3), 'aaaaaaaa-0000-0000-0000-000000000002', 'admin', null);

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000002'); -- now admin
select pg_temp.expect_fail($q$select public.update_member((select acc_a from t3), 'aaaaaaaa-0000-0000-0000-000000000001', 'viewer', null)$q$, 'admin demotes owner', 'forbidden');
select pg_temp.expect_fail($q$select public.update_member((select acc_a from t3), 'cccccccc-0000-0000-0000-000000000001', 'admin', null)$q$, 'admin promotes to admin', 'forbidden');
select pg_temp.expect_fail($q$select public.create_invite((select acc_a from t3), 'z@example.com', 'admin', null)$q$, 'admin invites admin', 'only owners');
select public.update_member((select acc_a from t3), 'cccccccc-0000-0000-0000-000000000001', 'viewer', null);
select pg_temp.eq((select count(*) from public.memberships where user_id = 'cccccccc-0000-0000-0000-000000000001' and role = 'viewer' and agent_name is null), 1, 'admin changes agent to viewer');
select pg_temp.expect_fail($q$select public.delete_account((select acc_a from t3))$q$, 'admin deletes account', 'forbidden');

-- Users still cannot write memberships or invites directly.
select pg_temp.expect_fail($q$update public.memberships set role = 'owner' where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'$q$, 'direct role change', 'permission denied');
select pg_temp.expect_fail($q$insert into public.invites (account_id, email, role) select acc_a, 'q@example.com', 'admin' from t3$q$, 'direct invite insert', 'permission denied');

-- A member can leave.
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000001');
select public.remove_member((select acc_a from t3), 'cccccccc-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.memberships where user_id = 'cccccccc-0000-0000-0000-000000000001'), 0, 'member left');
-- ...and can then create their own business account, but only one.
select public.create_account('Kasun Traders');
select pg_temp.expect_fail($q$select public.create_account('Second')$q$, 'second owned account', 'already own');

-------------------------------------------------------------------------------
-- Two-factor enforcement
-------------------------------------------------------------------------------
reset role;
insert into auth.mfa_factors (user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', 'verified');
set role authenticated;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'aal1');
select pg_temp.eq((select count(*) from public.surveys), 0, 'aal1 session with 2FA enabled sees nothing');
select pg_temp.eq((select count(*) from public.responses), 0, 'aal1 session sees no responses');
select pg_temp.expect_fail($q$select * from public.account_members((select acc_a from t3))$q$, 'aal1 lists members', 'forbidden');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select count(*) from public.surveys where account_id = (select acc_a from t3)), 1, 'aal2 session sees data');

-------------------------------------------------------------------------------
-- Privacy tools
-------------------------------------------------------------------------------
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select pg_temp.expect_fail($q$select public.erase_customer_data((select acc_a from t3), 'c1@x.com')$q$, 'other business erases A data', 'forbidden');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001', 'aal2');
select pg_temp.eq((select public.erase_customer_data((select acc_a from t3), 'C1@X.com')), 1, 'erase one customer (case-insensitive)');
select pg_temp.eq((select count(*) from public.responses where respondent_email = 'c1@x.com'), 0, 'customer data gone');
select public.delete_account((select acc_a from t3));
reset role;
select pg_temp.eq((select count(*) from public.accounts where id = (select acc_a from t3)), 0, 'account deleted');
select pg_temp.eq((select count(*) from public.surveys where account_id = (select acc_a from t3)), 0, 'surveys deleted with it');
select pg_temp.eq((select count(*) from public.accounts where id = (select acc_b from t3)), 1, 'other business untouched');

select 'ALL TEAM AND SECURITY TESTS PASSED' as result;
