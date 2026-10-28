-- 0008: platform admin (the product owner's console).
--   * Platform admins are listed in platform_admins. Nobody can add themselves: add the first one in the
--     SQL editor (see README). Every admin check ALSO requires a two-step-verified session (aal2).
--   * Admins edit the landing page, promotions/greetings and prices; manage businesses (credits, suspend).
--   * Admins see business-level numbers only, never customers' ratings or comments.
--   * Every admin change is written to platform_audit_log by the server.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  note       text check (char_length(note) <= 200)
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to service_role;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- 'none' (not an admin), 'needs_mfa' (admin, but this session hasn't done two-step verification), 'ok'.
create or replace function public.platform_admin_status()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.platform_admins where user_id = auth.uid()) then 'none'
    when coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then 'needs_mfa'
    else 'ok' end;
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
revoke all on function public.platform_admin_status() from public, anon;
grant execute on function public.platform_admin_status() to authenticated;

-------------------------------------------------------------------------------
-- Platform audit log (written by the server, read by admins)
-------------------------------------------------------------------------------

create table if not exists public.platform_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users(id) on delete set null,
  action      text not null check (char_length(action) <= 60),
  target_type text check (char_length(target_type) <= 40),
  target_id   text check (char_length(target_id) <= 80),
  metadata    jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 4096),
  ip_hash     text check (char_length(ip_hash) = 64),
  created_at  timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on public.platform_audit_log (created_at desc);
alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated;
grant select on public.platform_audit_log to authenticated;
grant select, insert on public.platform_audit_log to service_role;
create policy platform_audit_select on public.platform_audit_log for select to authenticated using (public.is_platform_admin());

-------------------------------------------------------------------------------
-- Editable site content (landing page). Plain text in JSON; the page escapes everything it shows.
-------------------------------------------------------------------------------

create table if not exists public.site_content (
  key          text primary key check (key in ('landing')),
  draft        jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) < 65536),
  published    jsonb check (published is null or (jsonb_typeof(published) = 'object' and pg_column_size(published) < 65536)),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  published_at timestamptz
);

create table if not exists public.site_promotions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('popup', 'greeting')),
  name       text not null check (char_length(name) between 1 and 60),
  title      text not null check (char_length(title) between 1 and 80),
  body       text check (char_length(body) <= 300),
  cta_label  text check (char_length(cta_label) between 1 and 30),
  -- Only https links or paths on our own site; never javascript:, data: or protocol-relative //.
  cta_url    text check (char_length(cta_url) <= 300 and cta_url ~ '^(https://[^\s/]+[^\s]*|/[A-Za-z0-9/_?=&.#-]*)$' and cta_url !~ '^//'),
  theme      text not null default 'generic' check (theme in ('generic', 'avurudu', 'vesak', 'poson', 'christmas', 'deepavali', 'ramadan', 'newyear', 'valentine', 'sale')),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  enabled    boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '366 days'),
  check ((cta_label is null) = (cta_url is null))
);
create index if not exists site_promotions_live_idx on public.site_promotions (kind, starts_at, ends_at) where enabled;

-------------------------------------------------------------------------------
-- Prices (moved out of code so the owner can change them). Item ids are fixed; new orders use the
-- price at the time of purchase, and existing subscriptions keep the price they were bought at.
-------------------------------------------------------------------------------

create table if not exists public.billing_catalog (
  item       text primary key check (item in ('starter', 'growth', 'scale', 'pack_250', 'pack_1000', 'pack_5000')),
  kind       text not null check (kind in ('plan', 'topup')),
  name       text not null check (char_length(name) between 1 and 40),
  blurb      text not null default '' check (char_length(blurb) <= 120),
  responses  integer not null check (responses between 1 and 1000000),
  lkr_month  bigint check (lkr_month between 100 and 100000000000),
  lkr_year   bigint check (lkr_year between 100 and 100000000000),
  usd_month  bigint check (usd_month between 50 and 1000000000),
  usd_year   bigint check (usd_year between 50 and 1000000000),
  lkr_price  bigint check (lkr_price between 100 and 100000000000),
  usd_price  bigint check (usd_price between 50 and 1000000000),
  active     boolean not null default true,
  sort       smallint not null default 0,
  updated_at timestamptz not null default now(),
  check ((item like 'pack_%') = (kind = 'topup')),
  check (kind <> 'plan' or (lkr_month is not null and lkr_year is not null and usd_month is not null and usd_year is not null)),
  check (kind <> 'topup' or (lkr_price is not null and usd_price is not null))
);

insert into public.billing_catalog (item, kind, name, blurb, responses, lkr_month, lkr_year, usd_month, usd_year, sort) values
  ('starter', 'plan', 'Starter', 'For a small team getting started', 500, 590000, 5900000, 1900, 19000, 1),
  ('growth', 'plan', 'Growth', 'For busy support and sales teams', 2000, 1490000, 14900000, 4900, 49000, 2),
  ('scale', 'plan', 'Scale', 'For high-volume and multi-team businesses', 10000, 3890000, 38900000, 12900, 129000, 3)
on conflict (item) do nothing;
insert into public.billing_catalog (item, kind, name, responses, lkr_price, usd_price, sort) values
  ('pack_250', 'topup', '250 responses', 250, 350000, 1200, 11),
  ('pack_1000', 'topup', '1,000 responses', 1000, 1190000, 3900, 12),
  ('pack_5000', 'topup', '5,000 responses', 5000, 4990000, 15900, 13)
on conflict (item) do nothing;

-- Access for the three editable tables: only platform admins (with two-step verification) may write.
do $$
declare t text;
begin
  foreach t in array array['site_content', 'site_promotions', 'billing_catalog'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())', t || '_admin', t);
  end loop;
end $$;
-- Nobody may rename or invent item ids, even admins.
revoke insert, delete on public.billing_catalog from authenticated;
revoke update on public.billing_catalog from authenticated;
grant update (name, blurb, responses, lkr_month, lkr_year, usd_month, usd_year, lkr_price, usd_price, active, updated_at) on public.billing_catalog to authenticated;
revoke update on public.site_content from authenticated;
grant update (key, draft, published, updated_at, updated_by, published_at) on public.site_content to authenticated;

-------------------------------------------------------------------------------
-- Managing businesses
-------------------------------------------------------------------------------

alter table public.accounts add column if not exists suspended_at timestamptz;
alter table public.accounts add column if not exists suspended_reason text check (char_length(suspended_reason) <= 300);

create table if not exists public.credit_adjustments (
  id         bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  admin_id   uuid references auth.users(id) on delete set null,
  amount     integer not null check (amount <> 0 and amount between -1000000 and 1000000),
  reason     text not null check (char_length(reason) between 3 and 300),
  balance_after integer not null,
  created_at timestamptz not null default now()
);
alter table public.credit_adjustments enable row level security;
revoke all on public.credit_adjustments from anon, authenticated;
grant select on public.credit_adjustments to authenticated;
grant select, insert on public.credit_adjustments to service_role;
-- Business owners can see adjustments made to their own account; platform admins see all.
create policy credit_adjustments_select on public.credit_adjustments for select to authenticated
  using (public.has_role(account_id, array['owner']) or public.is_platform_admin());

create or replace function public.admin_adjust_credits(p_account uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_balance integer; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  if p_amount is null or p_amount = 0 or p_amount not between -1000000 and 1000000 then raise exception 'invalid amount' using errcode = '22023'; end if;
  if char_length(v_reason) not between 3 and 300 then raise exception 'reason required' using errcode = '22023'; end if;
  update public.accounts set credit_balance = greatest(0, credit_balance + p_amount) where id = p_account returning credit_balance into v_balance;
  if not found then perform private.forbid('not found'); end if;
  insert into public.credit_adjustments (account_id, admin_id, amount, reason, balance_after) values (p_account, auth.uid(), p_amount, v_reason, v_balance);
  return v_balance;
end $$;

create or replace function public.admin_set_suspended(p_account uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  if p_suspend and char_length(v_reason) not between 3 and 300 then raise exception 'reason required' using errcode = '22023'; end if;
  update public.accounts set
    suspended_at = case when p_suspend then coalesce(suspended_at, now()) else null end,
    suspended_reason = case when p_suspend then v_reason else null end
  where id = p_account;
  if not found then perform private.forbid('not found'); end if;
end $$;

-- Suspended businesses stop collecting ratings (links, QR, widget, kiosk). They can still sign in,
-- see their data and export it.
create or replace function public.record_click(
  p_survey uuid, p_rating smallint, p_dedupe_key text,
  p_email text, p_agent text, p_ticket text, p_verified boolean,
  p_ip_hash text, p_user_agent text, p_channel text default 'email'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_status text; v_balance integer; v_suspended timestamptz; v_id uuid;
begin
  if p_channel not in ('email', 'qr', 'whatsapp', 'sms', 'link', 'web') then
    raise exception 'invalid channel';
  end if;
  select s.account_id, s.status, a.credit_balance, a.suspended_at into v_account, v_status, v_balance, v_suspended
  from public.surveys s join public.accounts a on a.id = s.account_id
  where s.id = p_survey;

  if v_account is null or v_status <> 'active' or v_balance <= 0 or v_suspended is not null then
    return null;
  end if;

  insert into public.responses as r (
    account_id, survey_id, pending_rating, status, respondent_email, agent, ticket_ref,
    metadata_verified, dedupe_key, ip_hash, user_agent, channel
  ) values (
    v_account, p_survey, p_rating, 'pending', p_email, p_agent, p_ticket,
    coalesce(p_verified, false), p_dedupe_key, p_ip_hash, left(p_user_agent, 300), p_channel
  )
  on conflict (survey_id, dedupe_key) do update set
    pending_rating = excluded.pending_rating,
    ip_hash = excluded.ip_hash,
    user_agent = excluded.user_agent
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.record_kiosk_rating(p_kiosk uuid, p_token_hash text, p_rating smallint, p_ip_hash text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k public.kiosks; v_status text; v_id uuid;
begin
  select * into k from public.kiosks where id = p_kiosk for update;
  if not found or k.revoked_at is not null or k.token_hash <> p_token_hash then return null; end if;
  select status into v_status from public.surveys where id = k.survey_id;
  if v_status is distinct from 'active' then return null; end if;
  if exists (select 1 from public.accounts where id = k.account_id and suspended_at is not null) then return null; end if;

  update public.accounts set credit_balance = credit_balance - 1 where id = k.account_id and credit_balance > 0;
  if not found then return null; end if;

  insert into public.responses (account_id, survey_id, rating, status, dedupe_key, ip_hash, user_agent, channel, credited, confirmed_at)
    values (k.account_id, k.survey_id, p_rating, 'confirmed', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), p_ip_hash, left(p_user_agent, 300), 'kiosk', true, now())
    returning id into v_id;
  update public.kiosks set last_used_at = now() where id = p_kiosk;
  return v_id;
end $$;

-- Business-level numbers for the owner's overview. No customer data.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  select jsonb_build_object(
    'businesses', (select count(*) from public.accounts),
    'new_30d', (select count(*) from public.accounts where created_at > now() - interval '30 days'),
    'new_7d', (select count(*) from public.accounts where created_at > now() - interval '7 days'),
    'active_30d', (select count(distinct account_id) from public.responses where status = 'confirmed' and created_at > now() - interval '30 days' and channel <> 'import'),
    'suspended', (select count(*) from public.accounts where suspended_at is not null),
    'paying', (select count(distinct account_id) from public.subscriptions where status in ('active', 'past_due')),
    'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'responses_30d', (select count(*) from public.responses where status = 'confirmed' and created_at > now() - interval '30 days' and channel <> 'import'),
    'responses_total', (select count(*) from public.responses where status = 'confirmed'),
    'mrr', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (
              select currency, sum(case when billing_interval = 'year' then amount_minor / 12 else amount_minor end) as total
              from public.subscriptions where status in ('active', 'past_due') group by currency) m),
    'revenue_30d', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (
              select currency, sum(amount_minor) as total from public.billing_payments
              where status = 'paid' and paid_at > now() - interval '30 days' group by currency) r),
    'plans', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select plan, count(*) as n from public.accounts group by plan) p),
    'billing_problems_30d', (select count(*) from public.billing_events where outcome like 'rejected%' and received_at > now() - interval '30 days'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d), '[]'::jsonb) from (
              select date_trunc('day', created_at)::date as d, count(*) as n from public.accounts
              where created_at > now() - interval '30 days' group by 1) s)
  ) into v;
  return v;
end $$;

create or replace function public.admin_list_accounts(p_search text, p_limit integer, p_offset integer)
returns table (id uuid, name text, plan text, credits integer, created_at timestamptz, suspended boolean, owner_email text, members bigint, responses_30d bigint, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := lower(btrim(coalesce(p_search, '')));
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  if char_length(v_q) > 100 or p_limit not between 1 and 100 or p_offset not between 0 and 100000 then raise exception 'invalid query' using errcode = '22023'; end if;
  return query
  with base as (
    select a.id, a.name, a.plan, a.credit_balance, a.created_at, a.suspended_at,
      (select u.email from public.memberships m join auth.users u on u.id = m.user_id
        where m.account_id = a.id and m.role = 'owner' order by m.created_at limit 1)::text as owner_email
    from public.accounts a
  ), filtered as (
    -- position() instead of LIKE, so % and _ in the search are just text.
    select * from base b
    where v_q = '' or position(v_q in lower(b.name)) > 0 or position(v_q in lower(coalesce(b.owner_email, ''))) > 0 or b.id::text = v_q
  )
  select f.id, f.name, f.plan, f.credit_balance, f.created_at, f.suspended_at is not null, f.owner_email,
    (select count(*) from public.memberships m where m.account_id = f.id),
    (select count(*) from public.responses r where r.account_id = f.id and r.status = 'confirmed' and r.created_at > now() - interval '30 days' and r.channel <> 'import'),
    count(*) over ()
  from filtered f
  order by f.created_at desc
  limit p_limit offset p_offset;
end $$;

create or replace function public.admin_account_detail(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'plan', a.plan, 'credits', a.credit_balance, 'created_at', a.created_at,
    'suspended_at', a.suspended_at, 'suspended_reason', a.suspended_reason,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role) order by m.created_at), '[]'::jsonb)
                from public.memberships m join auth.users u on u.id = m.user_id where m.account_id = a.id),
    'surveys', (select count(*) from public.surveys s where s.account_id = a.id and s.status <> 'archived'),
    'responses_total', (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed'),
    'responses_30d', (select count(*) from public.responses r where r.account_id = a.id and r.status = 'confirmed' and r.created_at > now() - interval '30 days' and r.channel <> 'import'),
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('provider', s.provider, 'plan', s.plan, 'interval', s.billing_interval, 'amount_minor', s.amount_minor,
                        'currency', s.currency, 'status', s.status, 'cancel_at_period_end', s.cancel_at_period_end, 'current_period_end', s.current_period_end) order by s.created_at desc), '[]'::jsonb)
                      from public.subscriptions s where s.account_id = a.id),
    'payments', (select coalesce(jsonb_agg(x order by x->>'paid_at' desc), '[]'::jsonb) from (
                   select jsonb_build_object('receipt_no', p.receipt_no, 'description', p.description, 'amount_minor', p.amount_minor, 'currency', p.currency,
                     'status', p.status, 'paid_at', p.paid_at, 'provider', p.provider) as x
                   from public.billing_payments p where p.account_id = a.id order by p.paid_at desc limit 25) t),
    'adjustments', (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
                   select jsonb_build_object('amount', c.amount, 'reason', c.reason, 'balance_after', c.balance_after, 'created_at', c.created_at) as x
                   from public.credit_adjustments c where c.account_id = a.id order by c.created_at desc limit 25) t)
  ) into v
  from public.accounts a where a.id = p_account;
  if v is null then perform private.forbid('not found'); end if;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_adjust_credits(uuid, integer, text)',
    'public.admin_set_suspended(uuid, boolean, text)',
    'public.admin_overview()',
    'public.admin_list_accounts(text, integer, integer)',
    'public.admin_account_detail(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
