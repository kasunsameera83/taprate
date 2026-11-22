-- 0044: welcome emails for new businesses (sent by /api/cron/lifecycle).
--   setup        - about a day in and no survey yet: "your first rating is 2 minutes away"
--   first_rating - their first confirmed rating arrived
--   week1        - day 7: their first week in numbers (+ a plan suggestion on the free plan)
-- Each kind goes to a business at most once: the row is claimed before sending (primary key), so two
-- overlapping runs can't both send it. Owners can stop these with the link in the email.

create table if not exists public.lifecycle_emails (
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind       text not null check (kind in ('setup', 'first_rating', 'week1')),
  sent_at    timestamptz not null default now(),
  primary key (account_id, kind)
);
alter table public.lifecycle_emails enable row level security;
-- No policies: only the server (service role) reads or writes this table.
revoke all on public.lifecycle_emails from anon, authenticated;
grant select, insert, delete on public.lifecycle_emails to service_role;

alter table public.memberships add column if not exists tips_opt_out boolean not null default false;

-- From the email's "stop these emails" link (the server checked the signed link first).
create or replace function public.tips_opt_out(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  update public.memberships set tips_opt_out = true where user_id = p_user;
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.tips_opt_out(uuid) from public, anon, authenticated;
grant execute on function public.tips_opt_out(uuid) to service_role;

-- Businesses still in their first 30 days, with what the emails need. One query instead of one per business.
create or replace function public.lifecycle_candidates(p_limit integer default 500)
returns table (
  account_id uuid, name text, plan text, local_languages boolean, created_at timestamptz,
  surveys bigint, ratings bigint, ratings_7d bigint, happy_7d bigint, unhappy_7d bigint, sent text[]
) language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.plan, a.local_languages, a.created_at,
         (select count(*) from public.surveys s where s.account_id = a.id),
         (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed'),
         (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed' and r.created_at > now() - interval '7 days'),
         (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed' and r.sentiment = 'positive' and r.created_at > now() - interval '7 days'),
         (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed' and r.sentiment = 'negative' and r.created_at > now() - interval '7 days'),
         coalesce((select array_agg(l.kind) from public.lifecycle_emails l where l.account_id = a.id), '{}')
    from public.accounts a
   where a.created_at > now() - interval '30 days'
     and a.suspended_at is null
     and coalesce(a.plan, '') <> 'paused'
   order by a.created_at
   limit least(greatest(p_limit, 1), 2000);
$$;
revoke all on function public.lifecycle_candidates(integer) from public, anon, authenticated;
grant execute on function public.lifecycle_candidates(integer) to service_role;
