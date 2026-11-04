-- 0040: prepaid plans. Until PayHere switches on recurring payments for us, a plan can be bought as a
-- one-off payment for 1 or 3 months. The plan runs until the paid period ends, we remind the owner
-- before that, and then the business moves to the free plan (responses already bought are kept).
--
-- Security: only the server (service role) can create orders or record payments, as before. The period
-- is worked out HERE from the order (never from the browser or the payment notification), renewing the
-- same plan adds on to the end of the current period, and a refund ends the prepaid plan.

alter table public.billing_orders add column if not exists prepaid_months smallint
  check (prepaid_months between 1 and 12);
alter table public.billing_orders drop constraint if exists billing_orders_prepaid_plan;
alter table public.billing_orders add constraint billing_orders_prepaid_plan
  check (prepaid_months is null or (kind = 'plan' and billing_interval = 'month'));

alter table public.subscriptions add column if not exists prepaid boolean not null default false;
alter table public.subscriptions add column if not exists reminder_sent_at timestamptz;
-- A prepaid plan never renews by itself.
alter table public.subscriptions drop constraint if exists subscriptions_prepaid_no_renew;
alter table public.subscriptions add constraint subscriptions_prepaid_no_renew check (not prepaid or cancel_at_period_end);
create index if not exists subscriptions_prepaid_end_idx on public.subscriptions (current_period_end) where prepaid and status = 'active';

create or replace function public.billing_record_payment(
  p_order uuid, p_provider text, p_payment_id text, p_amount_minor bigint, p_currency text,
  p_sub_ref text default null, p_period_end timestamptz default null
) returns text language plpgsql security definer set search_path = '' as $$
declare o public.billing_orders; v_sub uuid; v_desc text; v_first boolean; v_bonus integer := 0; v_code text;
        v_old public.subscriptions; v_start timestamptz; v_end timestamptz;
begin
  select * into o from public.billing_orders where id = p_order for update;
  if not found then raise exception 'unknown order'; end if;
  if o.provider <> p_provider then raise exception 'provider mismatch'; end if;
  if o.amount_minor <> p_amount_minor or o.currency <> p_currency then raise exception 'amount mismatch'; end if;
  if p_payment_id is null or char_length(p_payment_id) not between 1 and 200 then raise exception 'invalid payment id'; end if;
  if o.kind = 'plan' and o.prepaid_months is null and (p_sub_ref is null or char_length(p_sub_ref) not between 1 and 200) then
    raise exception 'subscription reference required';
  end if;
  if exists (select 1 from public.billing_payments where provider = p_provider and provider_payment_id = p_payment_id) then
    return 'duplicate';
  end if;
  v_first := not exists (select 1 from public.billing_payments where order_id = o.id);
  if v_first then v_bonus := o.bonus_credits; end if;
  if o.promo_id is not null then select code into v_code from public.promo_codes where id = o.promo_id; end if;

  if o.kind = 'plan' and o.prepaid_months is not null then
    -- Prepaid: one row per paid period. Lock the business's live plan so two payments can't race.
    perform 1 from public.accounts where id = o.account_id for update;
    select * into v_old from public.subscriptions
      where account_id = o.account_id and status in ('active', 'past_due') order by created_at desc limit 1 for update;
    if found and not v_old.prepaid then
      -- A recurring plan is already running (checkout blocks this). Keep the money's worth: add the responses only.
      v_desc := initcap(o.item) || ' plan, ' || o.prepaid_months || ' month' || case when o.prepaid_months > 1 then 's' else '' end
                || ' (' || o.credits || ' responses, added to your balance)';
      update public.accounts set credit_balance = credit_balance + o.credits + v_bonus where id = o.account_id;
    else
      -- Renewing the same plan adds on to the end; a different plan starts today.
      v_start := case when v_old.id is not null and v_old.plan = o.item and v_old.current_period_end > now() then v_old.current_period_end else now() end;
      v_end := v_start + make_interval(months => o.prepaid_months::int);
      if v_old.id is not null then
        update public.subscriptions set status = 'ended', updated_at = now() where id = v_old.id;
      end if;
      insert into public.subscriptions (account_id, order_id, provider, provider_sub_id, plan, billing_interval, credits_per_period, amount_minor, currency,
                                        current_period_end, prepaid, cancel_at_period_end)
        values (o.account_id, o.id, o.provider, 'prepaid:' || o.id::text, o.item, 'month', o.credits, o.amount_minor, o.currency, v_end, true, true)
      on conflict (provider, provider_sub_id) do update set updated_at = now()
      returning id into v_sub;
      v_desc := initcap(o.item) || ' plan, ' || o.prepaid_months || ' month' || case when o.prepaid_months > 1 then 's' else '' end
                || ' to ' || to_char(v_end at time zone 'Asia/Colombo', 'DD Mon YYYY') || ' (' || o.credits || ' responses)';
      update public.accounts set plan = o.item, credit_balance = credit_balance + o.credits + v_bonus where id = o.account_id and plan <> 'paused';
      if not found then update public.accounts set credit_balance = credit_balance + o.credits + v_bonus where id = o.account_id; end if;
    end if;
  elsif o.kind = 'plan' then
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

-- A refund or chargeback also ends a prepaid plan it paid for.
create or replace function public.billing_reverse_payment(p_provider text, p_payment_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.billing_payments; s public.subscriptions;
begin
  select * into p from public.billing_payments where provider = p_provider and provider_payment_id = p_payment_id for update;
  if not found then return 'unknown'; end if;
  if p.status = 'refunded' then return 'duplicate'; end if;
  update public.billing_payments set status = 'refunded', refunded_at = now() where id = p.id;
  update public.accounts set credit_balance = greatest(0, credit_balance - p.credits_granted) where id = p.account_id;
  if not exists (select 1 from public.billing_payments where order_id = p.order_id and status = 'paid') then
    update public.billing_orders set status = 'refunded' where id = p.order_id;
  end if;
  if p.subscription_id is not null then
    select * into s from public.subscriptions where id = p.subscription_id for update;
    if found and s.prepaid and s.status <> 'ended' then
      update public.subscriptions set status = 'ended', updated_at = now() where id = s.id;
      if not exists (select 1 from public.subscriptions where account_id = s.account_id and id <> s.id and status in ('active', 'past_due')) then
        update public.accounts set plan = 'free' where id = s.account_id and plan <> 'paused';
      end if;
    end if;
  end if;
  return 'reversed';
end $$;

-- Server only (same as before).
revoke all on function public.billing_record_payment(uuid, text, text, bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.billing_record_payment(uuid, text, text, bigint, text, text, timestamptz) to service_role;
revoke all on function public.billing_reverse_payment(text, text) from public, anon, authenticated;
grant execute on function public.billing_reverse_payment(text, text) to service_role;
