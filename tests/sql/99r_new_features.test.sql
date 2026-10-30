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

-- 0035 replies, 0036 branding tiers, 0037 benchmarks, 0038 survey domains.
create temp table a35 as select account_id as acc from public.memberships where user_id = 'dddddddd-0000-0000-0000-000000000001' and role = 'owner';
grant select on a35 to authenticated, service_role;
update public.accounts set plan = 'starter', suspended_at = null, hide_branding = false where id = (select acc from a35);
create temp table r35 as select id from public.responses where account_id = (select acc from a35) and status = 'confirmed' limit 1;
grant select on r35 to authenticated, service_role;
update public.responses set respondent_email = 'unhappy@example.com' where id = (select id from r35);
delete from public.email_suppressions where email = 'unhappy@example.com';

-- Replies: owner can; viewer can't; free plan can't; blocked addresses refused; subject one line.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from (select public.record_followup_reply((select id from r35), 'Sorry about that', 'We have fixed it.')) x), 1, 'owner records a reply');
select pg_temp.expect_fail($q$select public.record_followup_reply((select id from r35), 'Two
lines', 'x')$q$, 'subject with a line break', 'invalid subject');
select pg_temp.expect_fail($q$select public.record_followup_reply((select id from r35), 'Hi', '')$q$, 'empty reply', 'invalid note');
reset role;
select pg_temp.eq((select count(*) from public.followup_notes where response_id = (select id from r35) and kind = 'reply' and sent_to = 'unhappy@example.com' and send_status = 'sending'), 1, 'reply kept on the history');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000003'); -- viewer
set role authenticated;
select pg_temp.expect_fail($q$select public.record_followup_reply((select id from r35), 'Hi', 'x')$q$, 'viewer replies', 'forbidden');
reset role;
insert into public.email_suppressions (account_id, email, reason) values (null, 'unhappy@example.com', 'bounced');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.record_followup_reply((select id from r35), 'Hi', 'x')$q$, 'reply to a bounced address', 'customer email blocked');
reset role;
delete from public.email_suppressions where email = 'unhappy@example.com';
update public.accounts set plan = 'free' where id = (select acc from a35);
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.record_followup_reply((select id from r35), 'Hi', 'x')$q$, 'free plan replies', 'upgrade required: replies');
-- Users can't write notes or change reply status directly.
select pg_temp.expect_fail($q$update public.followup_notes set send_status = 'sent'$q$, 'direct status change', 'permission denied');
reset role;

-- Branding: Starter can't hide it; Growth can; downgrade check.
update public.accounts set plan = 'starter' where id = (select acc from a35);
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$update public.accounts set hide_branding = true where id = (select acc from a35)$q$, 'starter hides branding', 'upgrade required: white_label');
reset role;
update public.accounts set plan = 'growth' where id = (select acc from a35);
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
update public.accounts set hide_branding = true where id = (select acc from a35);
reset role;
select pg_temp.eq((select count(*) from public.accounts where id = (select acc from a35) and hide_branding), 1, 'growth hides branding');
select pg_temp.eq(private.plan_allows('growth', 'white_label')::int, 1, 'growth white label');
select pg_temp.eq(private.plan_allows('starter', 'white_label')::int, 0, 'starter no white label');
select pg_temp.eq(private.plan_allows('growth', 'custom_domain')::int, 0, 'growth no custom domain');
select pg_temp.eq(private.plan_allows('scale', 'custom_domain')::int, 1, 'scale custom domain');

-- Benchmarks: no industry → nothing; fewer than 5 others → no average; outsiders refused.
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from (select public.industry_benchmark((select acc from a35)) b) x where b ->> 'industry' is null), 1, 'no industry yet');
update public.accounts set industry = 'restaurant' where id = (select acc from a35);
select pg_temp.eq((select count(*) from (select public.industry_benchmark((select acc from a35)) b) x where b ->> 'average' is null and (b ->> 'enough')::boolean = false), 1, 'not enough businesses: no average');
select pg_temp.expect_fail($q$update public.accounts set industry = 'bogus' where id = (select acc from a35)$q$, 'unknown industry', 'violates check');
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.expect_fail($q$select public.industry_benchmark((select acc from a35))$q$, 'outsider reads benchmark', 'forbidden');
reset role;

-- Survey domains: Scale only, server-written, owners/admins read, valid subdomains only.
set role service_role;
select pg_temp.expect_fail($q$insert into public.survey_domains (account_id, domain) values ((select acc from a35), 'feedback.kova.lk')$q$, 'growth adds survey domain', 'upgrade required: custom_domain');
reset role;
update public.accounts set plan = 'scale' where id = (select acc from a35);
set role service_role;
insert into public.survey_domains (account_id, domain) values ((select acc from a35), 'feedback.kova.lk');
select pg_temp.expect_fail($q$insert into public.survey_domains (account_id, domain) values ((select acc from a35), 'x.taptruly.com')$q$, 'our own domain', 'violates check|duplicate');
reset role;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from public.survey_domains), 1, 'owner sees own domain');
select pg_temp.expect_fail($q$update public.survey_domains set status = 'verified'$q$, 'owner verifies directly', 'permission denied');
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.eq((select count(*) from public.survey_domains), 0, 'outsider sees none');
reset role;
set role service_role;
select pg_temp.expect_fail($q$insert into public.survey_domains (account_id, domain) values ((select account_id from public.memberships where user_id = 'bbbbbbbb-0000-0000-0000-000000000001' limit 1), 'kova.lk')$q$, 'apex domain', 'violates check|upgrade required');
reset role;

delete from public.survey_domains where account_id = (select acc from a35);
update public.accounts set plan = 'growth', hide_branding = false, industry = null where id = (select acc from a35);
