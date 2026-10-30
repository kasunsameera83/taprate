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

-- Free plan limits (0031). A brand-new business (trial = free, unpaid) gets the core product only.
insert into auth.users (id, email, raw_user_meta_data) values ('ffffffff-0000-0000-0000-000000000001', 'free-owner@example.com', '{"account_name":"Free Co"}');
create temp table f31 as select account_id as acc from public.memberships where user_id = 'ffffffff-0000-0000-0000-000000000001';
grant select on f31 to authenticated, service_role;
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from f31) and plan = 'trial'), 1, 'new business is unpaid');

select pg_temp.as_user('ffffffff-0000-0000-0000-000000000001');
set role authenticated;
-- Paid features are refused, through the normal functions...
select pg_temp.expect_fail($q$select public.create_api_key((select acc from f31), 'CRM', array['read'], repeat('a',64), null)$q$, 'free: API key', 'upgrade required: api');
select pg_temp.expect_fail($q$select public.create_tv_screen((select acc from f31), 'Lobby', repeat('b',64), null, null, false)$q$, 'free: TV screen', 'upgrade required: tv');
select pg_temp.expect_fail($q$update public.accounts set ai_insights_enabled = true where id = (select acc from f31)$q$, 'free: switch AI on', 'upgrade required: ai');
-- ...and the limits: 1 location, 2 team members (owner + 1).
select public.create_location((select acc from f31), 'Main shop');
select pg_temp.expect_fail($q$select public.create_location((select acc from f31), 'Second shop')$q$, 'free: second location', 'plan limit: locations');
select public.create_invite((select acc from f31), 'helper@example.com', 'viewer', null);
select pg_temp.expect_fail($q$select public.create_invite((select acc from f31), 'third@example.com', 'viewer', null)$q$, 'free: third team member', 'plan limit: members');
reset role;

-- ...and even the server (service role) can't create them for a free business.
set role service_role;
select pg_temp.expect_fail($q$insert into public.integrations (account_id, kind, name, url_encrypted, url_hint, events) values ((select acc from f31), 'slack', 'x', 'v1.c', 'h', array['all'])$q$, 'free: integration (server)', 'upgrade required: integrations');
select pg_temp.expect_fail($q$insert into public.report_subscriptions (account_id, user_id, frequency) values ((select acc from f31), 'ffffffff-0000-0000-0000-000000000001', 'weekly')$q$, 'free: email reports (server)', 'upgrade required: reports');
select pg_temp.expect_fail($q$insert into public.sending_domains (account_id, domain, provider_id) values ((select acc from f31), 'mail.free.lk', 'r')$q$, 'free: own domain (server)', 'upgrade required: own_domain');
reset role;

-- Archive-and-restore can't get around the location limit.
update public.locations set archived_at = now() where account_id = (select acc from f31);
insert into public.locations (account_id, name) values ((select acc from f31), 'New main');
select pg_temp.expect_fail($q$update public.locations set archived_at = null where account_id = (select acc from f31) and name = 'Main shop'$q$, 'free: restore archived location', 'plan limit: locations');

-- Repeat sends can't be switched on.
insert into public.surveys (account_id, name, question, icon_set, created_by)
  select acc, 'Free survey', 'How did we do?', 'faces5', 'ffffffff-0000-0000-0000-000000000001' from f31;
insert into public.survey_sends (account_id, survey_id, source, name, subject, skip_recent_days)
  select (select acc from f31), s.id, 'manual', 'x', 'y', 30 from public.surveys s where s.account_id = (select acc from f31) limit 1;
select pg_temp.eq((select count(*) from public.survey_sends where account_id = (select acc from f31)), 1, 'free can make a normal send');
select pg_temp.expect_fail($q$update public.survey_sends set repeat_days = 30 where account_id = (select acc from f31)$q$, 'free: repeat send', 'upgrade required: repeats');

-- After paying (Starter): all of the above work, except own domain (Scale only).
update public.accounts set plan = 'starter' where id = (select acc from f31);
select pg_temp.as_user('ffffffff-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from (select public.create_api_key((select acc from f31), 'CRM', array['read'], repeat('c',64), null)) x), 1, 'starter: API key');
select pg_temp.eq((select count(*) from (select public.create_location((select acc from f31), 'Second shop')) x), 1, 'starter: second location');
select pg_temp.eq((select count(*) from (select public.create_invite((select acc from f31), 'third@example.com', 'viewer', null)) x), 1, 'starter: third member');
update public.accounts set ai_insights_enabled = true where id = (select acc from f31);
reset role;
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from f31) and ai_insights_enabled), 1, 'starter: AI on');
set role service_role;
select pg_temp.expect_fail($q$insert into public.sending_domains (account_id, domain, provider_id) values ((select acc from f31), 'mail.free.lk', 'r')$q$, 'starter: own domain', 'upgrade required: own_domain');
reset role;
update public.survey_sends set repeat_days = 30, next_run_at = now() - interval '1 minute' where account_id = (select acc from f31);
select pg_temp.eq((select count(*) from public.survey_sends where account_id = (select acc from f31) and repeat_days = 30), 1, 'starter: repeat send on');

insert into public.send_recipients (send_id, account_id, survey_id, email, status)
  select id, account_id, survey_id, 'loyal@example.com', 'sent' from public.survey_sends where account_id = (select acc from f31);

-- Back on the free plan: repeat sends pause (nothing new is made), nothing is deleted.
update public.accounts set plan = 'free' where id = (select acc from f31);
create temp table before31 as select count(*) as n from public.survey_sends where account_id = (select acc from f31);
select public.run_repeat_sends();
select pg_temp.eq((select count(*) from public.survey_sends where account_id = (select acc from f31)), (select n from before31), 'free: repeat send paused');
-- Paid again: the repeat runs.
update public.accounts set plan = 'growth' where id = (select acc from f31);
update public.survey_sends set next_run_at = now() - interval '1 minute' where account_id = (select acc from f31) and repeat_days is not null;
select public.run_repeat_sends();
select pg_temp.eq((select count(*) from public.survey_sends where account_id = (select acc from f31)), (select n from before31) + 1, 'paid: repeat send runs');
select pg_temp.eq((select count(*) from public.api_keys where account_id = (select acc from f31)), 1, 'downgrade keeps existing keys (they just stop working)');

-- Helpers are server-only.
select pg_temp.eq((select count(*) from information_schema.routine_privileges where routine_schema = 'private'
  and routine_name in ('plan_allows', 'account_allows', 'account_limit') and grantee in ('anon', 'authenticated', 'PUBLIC'))::bigint, 0, 'plan helpers not callable by users');

delete from auth.users where id = 'ffffffff-0000-0000-0000-000000000001';
