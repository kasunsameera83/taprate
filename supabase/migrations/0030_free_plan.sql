-- The free plan, editable in /admin → Pricing: how many free responses a new business gets, and how
-- many survey emails a free (or new, unpaid) business can send a day.
-- One row only. Read by the server (service role); changed only by platform admins with 2-step verification.
create table if not exists public.platform_settings (
  id                boolean primary key default true check (id),
  free_responses    integer not null default 50  check (free_responses between 0 and 1000),
  free_daily_emails integer not null default 100 check (free_daily_emails between 0 and 1000),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
grant update (free_responses, free_daily_emails, updated_at, updated_by) on public.platform_settings to authenticated;
grant select on public.platform_settings to service_role;

drop policy if exists platform_settings_admin_select on public.platform_settings;
create policy platform_settings_admin_select on public.platform_settings for select to authenticated using (public.is_platform_admin());
drop policy if exists platform_settings_admin_update on public.platform_settings;
create policy platform_settings_admin_update on public.platform_settings for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin() and id);

-- New businesses start with the current number of free responses (instead of the fixed 50).
create or replace function private.free_start_credits()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.credit_balance := coalesce((select s.free_responses from public.platform_settings s where s.id), 50);
  return new;
end $$;
revoke all on function private.free_start_credits() from public;
drop trigger if exists accounts_free_start on public.accounts;
create trigger accounts_free_start before insert on public.accounts
  for each row execute function private.free_start_credits();

-- Daily email limits: paid plans fixed (keep in step with SEND_LIMITS in src/lib/billing/catalog.ts);
-- free and new businesses follow the setting above.
create or replace function private.daily_send_limit(p_plan text)
returns integer language sql stable security definer set search_path = '' as $$
  select case p_plan
    when 'scale'   then 5000
    when 'growth'  then 2000
    when 'starter' then 500
    when 'trial'   then coalesce((select s.free_daily_emails from public.platform_settings s where s.id), 100)
    when 'free'    then coalesce((select s.free_daily_emails from public.platform_settings s where s.id), 100)
    else 0                       -- paused, or anything unknown: no sending
  end;
$$;
revoke all on function private.daily_send_limit(text) from public;
