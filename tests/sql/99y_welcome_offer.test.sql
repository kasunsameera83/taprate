-- 0045 welcome offer: the new column's limits, and only platform admins can set it.
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

insert into public.promo_codes (code, kind, percent_off, new_business_days) values ('WELCOME50T', 'percent', 50, 7);
select pg_temp.ok((select new_business_days from public.promo_codes where code = 'WELCOME50T') = 7, 'welcome days stored');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off, new_business_days) values ('WELCOME0', 'percent', 50, 0)$q$, '0 days', 'check');
select pg_temp.expect_fail($q$insert into public.promo_codes (code, kind, percent_off, new_business_days) values ('WELCOME61', 'percent', 50, 61)$q$, '61 days', 'check');

-- A business owner can't turn a code into a welcome offer (or touch codes at all).
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
update public.promo_codes set new_business_days = 60 where code = 'WELCOME50T';
reset role;
select pg_temp.ok((select new_business_days from public.promo_codes where code = 'WELCOME50T') = 7, 'owner cannot change welcome days (RLS)');

-- The server can read it.
set role service_role;
select pg_temp.ok((select count(*) from public.promo_codes where code = 'WELCOME50T' and new_business_days is not null) = 1, 'service role reads it');
reset role;

delete from public.promo_codes where code = 'WELCOME50T';
