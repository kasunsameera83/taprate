-- 0043: checkout is idempotent. A double-click on "Pay", a second tab or a retry within 30 minutes gets
-- the SAME unpaid order back instead of a new one, so the customer can't be charged twice for one
-- purchase. Stripe already reuses its checkout session per order (idempotency key "checkout-<order id>"),
-- and PayHere sees the same order id. The match is exact: same business, provider, item, period, months,
-- price, currency, responses and promo. Anything different (another plan, another promo, a new price)
-- is a new order. Paid, failed or cancelled orders are never reused.

create index if not exists billing_orders_pending_idx on public.billing_orders (account_id, created_at desc) where status = 'pending';

create or replace function public.billing_create_order(
  p_account uuid, p_user uuid, p_provider text, p_kind text, p_item text, p_interval text, p_credits integer,
  p_amount_minor bigint, p_currency text, p_promo uuid, p_list_amount_minor bigint, p_bonus_credits integer,
  p_prepaid_months smallint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_account is null then raise exception 'account required'; end if;
  -- One checkout at a time per business, so two clicks can't both miss each other and create two orders.
  perform pg_advisory_xact_lock(hashtextextended('billing_order:' || p_account::text, 0));

  select o.id into v_id from public.billing_orders o
   where o.account_id = p_account
     and o.status = 'pending'
     and o.created_at > now() - interval '30 minutes'
     and o.provider = p_provider
     and o.kind = p_kind
     and o.item = p_item
     and o.billing_interval is not distinct from p_interval
     and o.prepaid_months is not distinct from p_prepaid_months
     and o.credits = p_credits
     and o.amount_minor = p_amount_minor
     and o.currency = p_currency
     and o.promo_id is not distinct from p_promo
     and o.list_amount_minor is not distinct from p_list_amount_minor
     and o.bonus_credits = coalesce(p_bonus_credits, 0)
     -- Not if a payment already arrived for it (the status flips to paid, but be sure).
     and not exists (select 1 from public.billing_payments p where p.order_id = o.id)
   order by o.created_at desc
   limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.billing_orders (account_id, created_by, provider, kind, item, billing_interval, credits, amount_minor,
                                     currency, promo_id, list_amount_minor, bonus_credits, prepaid_months)
  values (p_account, p_user, p_provider, p_kind, p_item, p_interval, p_credits, p_amount_minor,
          p_currency, p_promo, p_list_amount_minor, coalesce(p_bonus_credits, 0), p_prepaid_months)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.billing_create_order(uuid, uuid, text, text, text, text, integer, bigint, text, uuid, bigint, integer, smallint) from public, anon, authenticated;
grant execute on function public.billing_create_order(uuid, uuid, text, text, text, text, integer, bigint, text, uuid, bigint, integer, smallint) to service_role;
