-- 0017: a weekly "wins" email to each agent: their ratings and kind words from the last week.
--   * Off until an owner switches it on (same rule as renaming the business).
--   * Each person can stop it from the email; only the server records that.

alter table public.accounts add column if not exists agent_wins_enabled boolean not null default false;
grant update (name, ai_insights_enabled, agent_wins_enabled) on public.accounts to authenticated;

alter table public.memberships add column if not exists wins_opt_out boolean not null default false;
alter table public.memberships add column if not exists wins_last_sent_at timestamptz;
-- No user grant on these: memberships stay server-side only.

-- From the email's "stop" link (the server checked the signed link first): every business this person is in.
create or replace function public.wins_opt_out(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  update public.memberships set wins_opt_out = true where user_id = p_user;
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.wins_opt_out(uuid) from public, anon, authenticated;
grant execute on function public.wins_opt_out(uuid) to service_role;
