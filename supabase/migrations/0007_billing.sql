-- 0007: billing (PayHere in LKR, Stripe in USD).
--   * Users can READ their billing data (owners only) but never write it.
--   * Orders are created by the server with prices from the server's own catalog.
--   * Credits and plans change ONLY when a verified payment notification arrives, through
--     service-role functions that check the amount and currency against the order and record each
--     provider payment once (so a replayed or duplicated notification can't grant credits twice).

alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check
  check (plan in ('trial', 'free', 'starter', 'growth', 'scale', 'paused'));

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table if not exists public.billing_profiles (
  account_id   uuid primary key references public.accounts(id) on delete cascade,
  first_name   text not null check (char_length(first_name) between 1 and 60),
  last_name    text not null check (char_length(last_name) between 1 and 60),
  email        text not null check (char_length(email) <= 254),
  phone        text not null check (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  address      text not null check (char_length(address) between 1 and 200),
  city         text not null check (char_length(city) between 1 and 80),
  country      text not null check (country ~ '^[A-Z]{2}$'),
  company      text check (char_length(company) <= 120),
  tax_id       text check (char_length(tax_id) <= 40),
  stripe_customer_id text check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,60}$'),
  updated_at   timestamptz not null default now()
);

create table if not exists public.billing_orders (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id) on delete cascade,
  created_by        uuid references auth.users(id) on delete set null,
  provider          text not null check (provider in ('payhere', 'stripe')),
  kind              text not null check (kind in ('plan', 'topup')),
  item              text not null check (item in ('starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000')),
  billing_interval  text check (billing_interval in ('month', 'year')),
  credits           integer not null check (credits > 0 and credits <= 1000000),
  amount_minor      bigint not null check (amount_minor > 0),
  currency          text not null check (currency in ('LKR', 'USD')),
  status            text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  provider_ref      text check (char_length(provider_ref) <= 200),
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  check ((kind = 'plan') = (billing_interval is not null)),
  check ((provider = 'payhere') = (currency = 'LKR'))
);
create index if not exists billing_orders_account_idx on public.billing_orders (account_id, created_at desc);

create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid not null references public.accounts(id) on delete cascade,
  order_id             uuid not null references public.billing_orders(id) on delete cascade,
  provider             text not null check (provider in ('payhere', 'stripe')),
  provider_sub_id      text not null check (char_length(provider_sub_id) between 1 and 200),
  plan                 text not null check (plan in ('starter', 'growth', 'scale')),
  billing_interval     text not null check (billing_interval in ('month', 'year')),
  credits_per_period   integer not null check (credits_per_period > 0),
  amount_minor         bigint not null check (amount_minor > 0),
  currency             text not null check (currency in ('LKR', 'USD')),
  status               text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'ended')),
  cancel_at_period_end boolean not null default false,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, provider_sub_id)
);
-- At most one live subscription per business.
create unique index if not exists subscriptions_one_live on public.subscriptions (account_id) where status in ('active', 'past_due');

create sequence if not exists public.billing_receipt_seq start 1001;

create table if not exists public.billing_payments (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.accounts(id) on delete cascade,
  order_id            uuid not null references public.billing_orders(id) on delete cascade,
  subscription_id     uuid references public.subscriptions(id) on delete set null,
  provider            text not null check (provider in ('payhere', 'stripe')),
  provider_payment_id text not null check (char_length(provider_payment_id) between 1 and 200),
  receipt_no          text not null unique default ('TR-' || lpad(nextval('public.billing_receipt_seq')::text, 6, '0')),
  description         text not null check (char_length(description) <= 200),
  amount_minor        bigint not null check (amount_minor > 0),
  currency            text not null check (currency in ('LKR', 'USD')),
  credits_granted     integer not null check (credits_granted >= 0),
  status              text not null default 'paid' check (status in ('paid', 'refunded')),
  paid_at             timestamptz not null default now(),
  refunded_at         timestamptz,
  unique (provider, provider_payment_id)
);
create index if not exists billing_payments_account_idx on public.billing_payments (account_id, paid_at desc);

-- Every notification we accept, once (replays are ignored). Kept for support and audits.
create table if not exists public.billing_events (
  id          bigint generated always as identity primary key,
  provider    text not null check (provider in ('payhere', 'stripe')),
  event_id    text not null check (char_length(event_id) between 1 and 200),
  event_type  text not null check (char_length(event_type) <= 80),
  account_id  uuid references public.accounts(id) on delete set null,
  outcome     text not null check (char_length(outcome) <= 80),
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

-------------------------------------------------------------------------------
-- Access: owners can read; nobody but the server can write.
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['billing_profiles', 'billing_orders', 'subscriptions', 'billing_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.has_role(account_id, array[''owner'']))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_mfa', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok())', t || '_mfa', t);
  end loop;
end $$;

alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;
grant select, insert on public.billing_events to service_role;
grant usage on sequence public.billing_receipt_seq to service_role;
grant usage, select on all sequences in schema public to service_role;

-------------------------------------------------------------------------------
-- Server-only functions (called from verified webhooks)
-------------------------------------------------------------------------------

-- Records one successful provider payment for an order and grants what it paid for.
-- Returns 'granted', 'duplicate' (already recorded) or raises on any mismatch.
create or replace function public.billing_record_payment(
  p_order uuid, p_provider text, p_payment_id text, p_amount_minor bigint, p_currency text,
  p_sub_ref text default null, p_period_end timestamptz default null
) returns text language plpgsql security definer set search_path = '' as $$
declare o public.billing_orders; v_sub uuid; v_desc text;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'unknown order'; end if;
  if o.provider <> p_provider then raise exception 'provider mismatch'; end if;
  if o.amount_minor <> p_amount_minor or o.currency <> p_currency then raise exception 'amount mismatch'; end if;
  if p_payment_id is null or char_length(p_payment_id) not between 1 and 200 then raise exception 'invalid payment id'; end if;
  if o.kind = 'plan' and (p_sub_ref is null or char_length(p_sub_ref) not between 1 and 200) then raise exception 'subscription reference required'; end if;
  if exists (select 1 from public.billing_payments where provider = p_provider and provider_payment_id = p_payment_id) then
    return 'duplicate';
  end if;

  if o.kind = 'plan' then
    insert into public.subscriptions (account_id, order_id, provider, provider_sub_id, plan, billing_interval, credits_per_period, amount_minor, currency, current_period_end)
      values (o.account_id, o.id, o.provider, p_sub_ref, o.item, o.billing_interval, o.credits, o.amount_minor, o.currency, p_period_end)
    on conflict (provider, provider_sub_id) do update
      set status = case when public.subscriptions.status = 'ended' then 'ended' else 'active' end,
          current_period_end = coalesce(excluded.current_period_end, public.subscriptions.current_period_end),
          updated_at = now()
    returning id into v_sub;
    if (select account_id from public.subscriptions where id = v_sub) <> o.account_id then raise exception 'subscription belongs to another account'; end if;
    v_desc := initcap(o.item) || ' plan, ' || case when o.billing_interval = 'year' then 'yearly' else 'monthly' end || ' (' || o.credits || ' responses)';
    update public.accounts set plan = o.item, credit_balance = credit_balance + o.credits where id = o.account_id;
  else
    v_desc := o.credits || ' extra responses';
    update public.accounts set credit_balance = credit_balance + o.credits where id = o.account_id;
  end if;

  insert into public.billing_payments (account_id, order_id, subscription_id, provider, provider_payment_id, description, amount_minor, currency, credits_granted)
    values (o.account_id, o.id, v_sub, o.provider, p_payment_id, v_desc, o.amount_minor, o.currency, o.credits);
  update public.billing_orders set status = 'paid', paid_at = coalesce(paid_at, now()) where id = o.id;
  return 'granted';
end $$;

-- A refund or chargeback: marks the payment and takes back the credits it gave (as far as unused).
create or replace function public.billing_reverse_payment(p_provider text, p_payment_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.billing_payments;
begin
  select * into p from public.billing_payments where provider = p_provider and provider_payment_id = p_payment_id for update;
  if not found then return 'unknown'; end if;
  if p.status = 'refunded' then return 'duplicate'; end if;
  update public.billing_payments set status = 'refunded', refunded_at = now() where id = p.id;
  update public.accounts set credit_balance = greatest(0, credit_balance - p.credits_granted) where id = p.account_id;
  if not exists (select 1 from public.billing_payments where order_id = p.order_id and status = 'paid') then
    update public.billing_orders set status = 'refunded' where id = p.order_id;
  end if;
  return 'reversed';
end $$;

-- Subscription status changes from the provider (cancel scheduled, payment failing, ended).
create or replace function public.billing_subscription_update(
  p_provider text, p_sub_ref text, p_status text, p_cancel_at_period_end boolean default null, p_period_end timestamptz default null
) returns text language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions;
begin
  if p_status not in ('active', 'past_due', 'cancelled', 'ended') then raise exception 'invalid status'; end if;
  select * into s from public.subscriptions where provider = p_provider and provider_sub_id = p_sub_ref for update;
  if not found then return 'unknown'; end if;
  if s.status = 'ended' then return 'already ended'; end if;
  update public.subscriptions set
    status = p_status,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
    current_period_end = coalesce(p_period_end, current_period_end),
    updated_at = now()
  where id = s.id;
  -- When the plan is over, the business drops to the free plan. Credits already paid for are kept.
  if p_status = 'ended' and not exists (
    select 1 from public.subscriptions where account_id = s.account_id and id <> s.id and status in ('active', 'past_due')
  ) then
    update public.accounts set plan = 'free' where id = s.account_id and plan <> 'paused';
  end if;
  return 'updated';
end $$;

create or replace function public.billing_order_failed(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('failed', 'cancelled') then raise exception 'invalid status'; end if;
  update public.billing_orders set status = p_status where id = p_order and status = 'pending';
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.billing_record_payment(uuid, text, text, bigint, text, text, timestamptz)',
    'public.billing_reverse_payment(text, text)',
    'public.billing_subscription_update(text, text, text, boolean, timestamptz)',
    'public.billing_order_failed(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
