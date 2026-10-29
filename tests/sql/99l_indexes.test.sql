-- Indexes (0028): customer email lookups ignore capitals; every link used by deletes and billing has an index.
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

insert into public.responses (account_id, survey_id, pending_rating, status, respondent_email, dedupe_key)
select account_id, id, 1, 'pending', 'Mixed.Case@Example.COM', repeat('a', 64) from public.surveys where id = '5d000000-0000-0000-0000-000000000001';
select pg_temp.eq((select count(*) from public.responses where respondent_email_lc = 'mixed.case@example.com'), 1, 'lower-case copy kept by the database');
select pg_temp.expect_fail($q$update public.responses set respondent_email_lc = 'x' where dedupe_key = repeat('a', 64)$q$, 'copy cannot be written', 'generated|cannot|only be updated to DEFAULT');
delete from public.responses where dedupe_key = repeat('a', 64);

-- Every foreign key outside the small "created by" columns has an index starting with it.
select pg_temp.eq((
  select count(*) from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
    and a.attname not in ('created_by', 'updated_by')
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
), 0, 'no unindexed links');
