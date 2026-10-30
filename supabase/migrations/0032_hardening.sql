-- 0032: defence in depth. Older helper functions in the private schema still carried PostgreSQL's
-- default EXECUTE grant to PUBLIC. Users can't reach the private schema at all (no USAGE grant, and the
-- API only exposes public), so this was never callable, but we remove the grant anyway so nothing in
-- private is executable by anon or signed-in users even if schema access ever changed.
-- (Trigger functions don't need EXECUTE by the user whose change fires them.)
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- One exception: valid_labels is used inside a CHECK constraint on surveys, which runs as whoever saves the
-- survey, so they need EXECUTE on it. It's a pure check of a text array with no access to data.
grant execute on function private.valid_labels(text[]) to authenticated, service_role;

-- Future functions created in private get no default EXECUTE grant either.
alter default privileges in schema private revoke execute on functions from public;
