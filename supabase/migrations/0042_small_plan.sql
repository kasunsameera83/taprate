-- 0042: the "Small shop" plan (id 'small'), below Starter: 150 responses a month and 150 survey emails a
-- day, with the same features as Starter. Keep in step with src/lib/billing/catalog.ts (PLAN_IDS,
-- SEND_LIMITS, DEFAULT_CATALOG) and src/lib/billing/features.ts.

-- Every list of allowed plan ids learns about 'small'.
alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check
  check (plan in ('trial', 'free', 'small', 'starter', 'growth', 'scale', 'paused'));

alter table public.billing_orders drop constraint if exists billing_orders_item_check;
alter table public.billing_orders add constraint billing_orders_item_check
  check (item in ('small', 'starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000'));

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('small', 'starter', 'growth', 'scale'));

alter table public.billing_catalog drop constraint if exists billing_catalog_item_check;
alter table public.billing_catalog add constraint billing_catalog_item_check
  check (item in ('small', 'starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000'));

alter table public.promo_codes drop constraint if exists promo_codes_applies_to_check;
alter table public.promo_codes add constraint promo_codes_applies_to_check
  check (applies_to <@ array['small', 'starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000']::text[]);

-- Daily survey emails we send for a business.
create or replace function private.daily_send_limit(p_plan text)
returns integer language sql stable security definer set search_path = '' as $$
  select case p_plan
    when 'scale'   then 5000
    when 'growth'  then 2000
    when 'starter' then 500
    when 'small'   then 150
    when 'trial'   then coalesce((select s.free_daily_emails from public.platform_settings s where s.id), 100)
    when 'free'    then coalesce((select s.free_daily_emails from public.platform_settings s where s.id), 100)
    else 0                       -- paused, or anything unknown: no sending
  end;
$$;
revoke all on function private.daily_send_limit(text) from public;

-- Features: Small shop gets everything Starter gets.
create or replace function private.plan_allows(p_plan text, p_feature text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_feature
    when 'own_domain'    then p_plan = 'scale'
    when 'custom_domain' then p_plan = 'scale'
    when 'white_label'   then coalesce(p_plan in ('growth', 'scale'), false)
    else coalesce(p_plan in ('small', 'starter', 'growth', 'scale'), false)
  end;
$$;
revoke all on function private.plan_allows(text, text) from public, anon, authenticated;

-- Team members and locations: unlimited (1000) on every paid plan.
create or replace function private.account_limit(p_account uuid, p_what text)
returns integer language sql stable security definer set search_path = '' as $$
  select case when (select a.plan from public.accounts a where a.id = p_account) in ('small', 'starter', 'growth', 'scale') then 1000
              when p_what = 'members' then 2
              else 1 end;
$$;
revoke all on function private.account_limit(uuid, text) from public;

-- The price (the owner can change it in /admin/pricing). Shown first.
insert into public.billing_catalog (item, kind, name, blurb, responses, lkr_month, lkr_year, usd_month, usd_year, sort) values
  ('small', 'plan', 'Small shop', 'For a single shop, salon or café', 150, 199000, 1990000, 700, 7000, 0)
on conflict (item) do nothing;
