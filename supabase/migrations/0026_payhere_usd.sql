-- 0026: PayHere can also charge in US dollars (once PayHere switches it on for the merchant account).
-- Stripe stays dollars-only. Rupee orders must still go through PayHere.

do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.billing_orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%provider = ''payhere''%' and pg_get_constraintdef(oid) ilike '%currency = ''LKR''%'
  loop
    execute format('alter table public.billing_orders drop constraint %I', c);
  end loop;
end $$;

alter table public.billing_orders drop constraint if exists billing_orders_provider_currency;
alter table public.billing_orders add constraint billing_orders_provider_currency
  check ((provider = 'payhere' and currency in ('LKR', 'USD')) or (provider = 'stripe' and currency = 'USD'));
