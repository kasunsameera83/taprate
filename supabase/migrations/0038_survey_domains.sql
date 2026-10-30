-- 0038: survey pages on a business's own web address, e.g. feedback.kova.lk (Scale plan).
-- One subdomain per business. Written only by the server (after adding it to the hosting provider);
-- owners and admins can see it. Survey links use it only once it's verified.
create table if not exists public.survey_domains (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null unique references public.accounts(id) on delete cascade,
  domain      text not null unique check (
                char_length(domain) between 4 and 253
                and domain = lower(domain)
                and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$'
                and domain !~ '(^|\.)(taptruly\.com|vercel\.app|vercel\.com|localhost)$'),
  status      text not null default 'pending' check (status in ('pending', 'verified')),
  records     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  checked_at  timestamptz,
  verified_at timestamptz
);
alter table public.survey_domains enable row level security;
revoke all on public.survey_domains from anon, authenticated;
grant select on public.survey_domains to authenticated;
grant select, insert, update, delete on public.survey_domains to service_role;
drop policy if exists survey_domains_select on public.survey_domains;
create policy survey_domains_select on public.survey_domains for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));

drop trigger if exists survey_domains_plan on public.survey_domains;
create trigger survey_domains_plan before insert on public.survey_domains for each row execute function private.require_feature('custom_domain');
