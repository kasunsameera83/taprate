-- Blog (0027): only platform admins with two-step sign-in may read or write posts; nobody else can.
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

select pg_temp.eq((select count(*) from public.blog_posts where slug = 'why-one-tap-beats-ten-questions' and status = 'published'), 1, 'first post seeded');

-- Not an admin: sees and changes nothing.
set role authenticated;
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
select pg_temp.eq((select count(*) from public.blog_posts), 0, 'business owner sees no posts table rows');
select pg_temp.expect_fail($q$insert into public.blog_posts (slug, title) values ('hack-post', 'Hacked')$q$, 'non-admin creates post', 'row-level security');
update public.blog_posts set title = 'Hacked';
reset role;
select pg_temp.eq((select count(*) from public.blog_posts where title = 'Hacked'), 0, 'non-admin update had no effect');

set role anon;
select pg_temp.expect_fail($q$select * from public.blog_posts$q$, 'anon reads table', 'permission denied');
reset role;

-- Platform admin with two-step sign-in can write; without it, nothing.
insert into public.platform_admins (user_id) values ('dddddddd-0000-0000-0000-000000000001') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'dddddddd-0000-0000-0000-000000000001', 'aal', 'aal1')::text, false);
select pg_temp.expect_fail($q$insert into public.blog_posts (slug, title) values ('no-mfa-post', 'No MFA')$q$, 'admin without 2FA writes', 'row-level security');
select pg_temp.as_user('dddddddd-0000-0000-0000-000000000001');
insert into public.blog_posts (slug, title, body) values ('second-post', 'Second post', 'Hi');
select pg_temp.eq((select count(*) from public.blog_posts where slug = 'second-post' and status = 'draft'), 1, 'admin creates a draft');
select pg_temp.expect_fail($q$insert into public.blog_posts (slug, title) values ('Bad Slug', 'x y z')$q$, 'bad slug', 'check');
select pg_temp.expect_fail($q$insert into public.blog_posts (slug, title, status) values ('no-date', 'No date', 'published')$q$, 'published without a date', 'check');
select pg_temp.expect_fail($q$update public.blog_posts set cover_path = '../../etc/passwd' where slug = 'second-post'$q$, 'odd cover path', 'check');
select pg_temp.expect_fail($q$update public.blog_posts set created_by = null where slug = 'second-post'$q$, 'change author id', 'permission denied');
select pg_temp.expect_fail($q$insert into public.blog_posts (slug, title) values ('second-post', 'Again')$q$, 'duplicate slug', 'duplicate key|unique');
delete from public.blog_posts where slug = 'second-post';
reset role;
delete from public.platform_admins where user_id = 'dddddddd-0000-0000-0000-000000000001';
