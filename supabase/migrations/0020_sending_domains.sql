-- 0020: survey emails from the business's own domain (e.g. feedback@mail.kova.lk), on the Scale plan.
-- The domain is registered with our email provider; the business adds the DNS records it gives and
-- we only use the domain once the provider has verified it. One domain per business.
create table if not exists public.sending_domains (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references public.accounts(id) on delete cascade,
  domain      text not null check (char_length(domain) between 4 and 253 and domain = lower(domain) and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  from_local  text not null default 'feedback' check (from_local ~ '^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?$'),
  provider_id text not null check (char_length(provider_id) between 1 and 100),
  status      text not null default 'not_started' check (status in ('not_started', 'pending', 'verified', 'failed', 'temporary_failure')),
  records     jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array' and pg_column_size(records) < 16384),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  checked_at  timestamptz,
  verified_at timestamptz
);
create unique index if not exists sending_domains_domain_unique on public.sending_domains (domain);

alter table public.sending_domains enable row level security;
revoke all on public.sending_domains from anon, authenticated;
grant select (id, account_id, domain, from_local, status, records, created_at, checked_at, verified_at) on public.sending_domains to authenticated;
grant select, insert, update, delete on public.sending_domains to service_role;
drop policy if exists sending_domains_select on public.sending_domains;
create policy sending_domains_select on public.sending_domains for select to authenticated using (public.has_role(account_id, array['owner', 'admin']));
drop policy if exists sending_domains_mfa on public.sending_domains;
create policy sending_domains_mfa on public.sending_domains as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());
