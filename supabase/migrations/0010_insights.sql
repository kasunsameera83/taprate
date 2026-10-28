-- 0010: insights.
--   * AI summaries are OFF until an owner turns them on (customer comments are sent to the AI provider).
--   * Saved summaries: readable by owners, admins and viewers; written only by the server.
--   * Email reports: each person chooses their own; the server re-checks membership before every send.

alter table public.accounts add column if not exists ai_insights_enabled boolean not null default false;
-- Owners may switch it (same policy as renaming the business).
grant update (name, ai_insights_enabled) on public.accounts to authenticated;

create table if not exists public.insights (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  survey_id     uuid references public.surveys(id) on delete cascade,
  period_days   smallint not null check (period_days in (7, 30, 90)),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  comment_count integer not null check (comment_count >= 0),
  rating_count  integer not null check (rating_count >= 0),
  result        jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) < 65536),
  model         text not null check (char_length(model) <= 60),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists insights_account_idx on public.insights (account_id, created_at desc);

alter table public.insights enable row level security;
revoke all on public.insights from anon, authenticated;
grant select on public.insights to authenticated;
grant select, insert, delete on public.insights to service_role;
create policy insights_select on public.insights for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin', 'viewer']));
create policy insights_mfa on public.insights as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

create table if not exists public.report_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  frequency    text not null check (frequency in ('weekly', 'monthly')),
  survey_id    uuid references public.surveys(id) on delete set null,
  include_ai   boolean not null default false,
  last_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (account_id, user_id)
);

alter table public.report_subscriptions enable row level security;
revoke all on public.report_subscriptions from anon, authenticated;
grant select on public.report_subscriptions to authenticated;
grant select, insert, update, delete on public.report_subscriptions to service_role;
-- Everyone sees only their own report settings.
create policy report_subscriptions_select on public.report_subscriptions for select to authenticated
  using (user_id = auth.uid() and public.is_member(account_id));
