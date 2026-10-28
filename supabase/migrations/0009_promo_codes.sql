-- 0009: promo codes.
--   * Created by platform admins only. Customers never see the list; they can only try a code at
--     checkout (rate limited, and checked by the server).
--   * A discount is baked into the ORDER's amount by the server, so the payment notification must match
--     the discounted amount exactly, as before. Plan discounts stay for the life of that subscription.
--   * Bonus responses are added once, with the order's first successful payment.
--   * Each business can use a code once; optional total limit.

create table if not exists public.promo_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9_-]{4,30}$'),
  description   text not null default '' check (char_length(description) <= 120),
  kind          text not null check (kind in ('percent', 'amount', 'credits')),
  percent_off   smallint check (percent_off between 1 and 90),
  amount_off_lkr bigint check (amount_off_lkr between 100 and 100000000000),
  amount_off_usd bigint check (amount_off_usd between 50 and 1000000000),
  bonus_credits integer check (bonus_credits between 1 and 1000000),
  applies_to    text[] not null default '{}' check (applies_to <@ array['starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000']::text[]),
  max_uses      integer check (max_uses between 1 and 1000000),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  enabled       boolean not null default true,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (kind <> 'percent' or (percent_off is not null and amount_off_lkr is null and amount_off_usd is null and bonus_credits is null)),
  check (kind <> 'amount' or (percent_off is null and (amount_off_lkr is not null or amount_off_usd is not null) and bonus_credits is null)),
  check (kind <> 'credits' or (percent_off is null and amount_off_lkr is null and amount_off_usd is null and bonus_credits is not null))
);

create table if not exists public.promo_redemptions (
  id          bigint generated always as identity primary key,
  promo_id    uuid not null references public.promo_codes(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  order_id    uuid not null references public.billing_orders(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (promo_id, account_id)
);

alter table public.billing_orders add column if not exists promo_id uuid references public.promo_codes(id) on delete set null;
alter table public.billing_orders add column if not exists list_amount_minor bigint check (list_amount_minor > 0);
alter table public.billing_orders add column if not exists bonus_credits integer not null default 0 check (bonus_credits between 0 and 1000000);

-- Admins manage codes (with 2FA); nobody else can read or write them.
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;
grant select, insert, update, delete on public.promo_codes to authenticated;
grant select, insert, update, delete on public.promo_codes to service_role;
create policy promo_codes_admin on public.promo_codes for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
revoke update on public.promo_codes from authenticated;
-- The code itself and its kind can't change after creation (redemptions refer to what it was).
grant update (description, percent_off, amount_off_lkr, amount_off_usd, bonus_credits, applies_to, max_uses, starts_at, ends_at, enabled, updated_at) on public.promo_codes to authenticated;

alter table public.promo_redemptions enable row level security;
revoke all on public.promo_redemptions from anon, authenticated;
grant select on public.promo_redemptions to authenticated;
grant select, insert on public.promo_redemptions to service_role;
create policy promo_redemptions_admin on public.promo_redemptions for select to authenticated using (public.is_platform_admin());

-- Same as 0007, plus: first payment adds the order's bonus responses and records the redemption;
-- receipts mention the code.
create or replace function public.billing_record_payment(
  p_order uuid, p_provider text, p_payment_id text, p_amount_minor bigint, p_currency text,
  p_sub_ref text default null, p_period_end timestamptz default null
) returns text language plpgsql security definer set search_path = '' as $$
declare o public.billing_orders; v_sub uuid; v_desc text; v_first boolean; v_bonus integer := 0; v_code text;
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
  v_first := not exists (select 1 from public.billing_payments where order_id = o.id);
  if v_first then v_bonus := o.bonus_credits; end if;
  if o.promo_id is not null then select code into v_code from public.promo_codes where id = o.promo_id; end if;

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
    update public.accounts set plan = o.item, credit_balance = credit_balance + o.credits + v_bonus where id = o.account_id;
  else
    v_desc := o.credits || ' extra responses';
    update public.accounts set credit_balance = credit_balance + o.credits + v_bonus where id = o.account_id;
  end if;
  if v_bonus > 0 then v_desc := v_desc || ' + ' || v_bonus || ' bonus'; end if;
  if v_code is not null then v_desc := v_desc || ', code ' || v_code; end if;

  insert into public.billing_payments (account_id, order_id, subscription_id, provider, provider_payment_id, description, amount_minor, currency, credits_granted)
    values (o.account_id, o.id, v_sub, o.provider, p_payment_id, left(v_desc, 200), o.amount_minor, o.currency, o.credits + v_bonus);
  if v_first and o.promo_id is not null then
    insert into public.promo_redemptions (promo_id, account_id, order_id) values (o.promo_id, o.account_id, o.id)
      on conflict (promo_id, account_id) do nothing;
  end if;
  update public.billing_orders set status = 'paid', paid_at = coalesce(paid_at, now()) where id = o.id;
  return 'granted';
end $$;

-- Usage per code for the admin screen.
create or replace function public.admin_promo_stats()
returns table (promo_id uuid, uses bigint, revenue jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  return query
  select p.id,
    (select count(*) from public.promo_redemptions r where r.promo_id = p.id),
    (select coalesce(jsonb_object_agg(x.currency, x.total), '{}'::jsonb) from (
       select bp.currency, sum(bp.amount_minor) as total
       from public.billing_payments bp join public.billing_orders bo on bo.id = bp.order_id
       where bo.promo_id = p.id and bp.status = 'paid' group by bp.currency) x)
  from public.promo_codes p;
end $$;
revoke all on function public.admin_promo_stats() from public, anon;
grant execute on function public.admin_promo_stats() to authenticated;
