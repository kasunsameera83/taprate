-- 0045: welcome offer. A promo code with new_business_days set only works for a business that signed up
-- within that many days and has never paid, and the billing page offers it to them automatically (with
-- the real days left). The server checks this at checkout; the browser only shows the server's answer.
alter table public.promo_codes add column if not exists new_business_days smallint;
alter table public.promo_codes drop constraint if exists promo_codes_new_business_days_check;
alter table public.promo_codes add constraint promo_codes_new_business_days_check check (new_business_days is null or new_business_days between 1 and 60);
grant update (new_business_days) on public.promo_codes to authenticated;
