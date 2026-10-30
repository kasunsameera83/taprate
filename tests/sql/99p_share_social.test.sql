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

-- Social sharing consent (0033): needs website consent, is dropped with it, and with an unhappy rating.
create temp table r33 as select id from public.responses where sentiment = 'positive' and comment is not null limit 1;
select pg_temp.eq((select count(*) from r33), 1, 'a happy comment to test with');
update public.responses set share_consent = true, share_social = true, display_name = 'Janaka' where id = (select id from r33);
select pg_temp.eq((select count(*) from public.responses where id = (select id from r33) and share_social), 1, 'social consent stored');
-- Trying to keep social while withdrawing website consent: the database drops social too.
update public.responses set share_consent = false, share_social = true where id = (select id from r33);
select pg_temp.eq((select count(*) from public.responses where id = (select id from r33) and (share_social or display_name is not null)), 0, 'withdrawing consent clears social and the name');
-- Old consents (before 0033) stay website-only.
select pg_temp.eq((select count(*) from public.responses where share_consent and share_social and id <> (select id from r33)), 0, 'older consents are website-only');
