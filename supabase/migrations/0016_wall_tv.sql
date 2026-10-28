-- 0016: testimonial wall and office TV screens.
--   * Testimonials: a customer can agree (on the thank-you page) to their comment being shown on the
--     business's website, with an optional first name. Only those comments, from happy customers, can
--     be featured by an owner or admin. Withdrawn consent un-features the comment automatically.
--   * TV screens: a read-only live view for the office wall, opened with a secret link (only its hash is
--     stored, revocable). It never shows customer emails; comments only if the business chooses.

alter table public.responses add column if not exists share_consent boolean not null default false;
alter table public.responses add column if not exists display_name text
  check (display_name is null or (char_length(display_name) between 1 and 40 and display_name !~ '[[:cntrl:]<>@]'));
alter table public.responses add column if not exists featured_at timestamptz;
alter table public.responses drop constraint if exists responses_featured_needs_consent;
alter table public.responses add constraint responses_featured_needs_consent check (featured_at is null or share_consent);
create index if not exists responses_featured_idx on public.responses (account_id, featured_at desc) where featured_at is not null;

-- Consent withdrawn (or never given): no name, not featured.
create or replace function private.share_consent_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not new.share_consent then
    new.display_name := null;
    new.featured_at := null;
  end if;
  if new.comment is null or new.sentiment is distinct from 'positive' then
    new.featured_at := null;
  end if;
  -- An edited comment must be approved again before it shows on the website.
  if tg_op = 'UPDATE' and new.comment is distinct from old.comment then
    new.featured_at := null;
  end if;
  return new;
end $$;
drop trigger if exists responses_share_consent on public.responses;
create trigger responses_share_consent before insert or update of share_consent, display_name, featured_at, comment, sentiment on public.responses
  for each row execute function private.share_consent_rules();

create or replace function public.feature_response(p_response uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.responses;
begin
  select * into r from public.responses where id = p_response;
  if not found then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(r.account_id, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if p_featured and (not r.share_consent or r.comment is null or r.sentiment is distinct from 'positive') then
    raise exception 'not shareable' using errcode = '22023';
  end if;
  if p_featured and (select count(*) from public.responses where account_id = r.account_id and featured_at is not null) >= 50 then
    raise exception 'too many featured' using errcode = '54000';
  end if;
  update public.responses set featured_at = case when p_featured then coalesce(featured_at, now()) else null end where id = p_response;
end $$;
revoke all on function public.feature_response(uuid, boolean) from public, anon;
grant execute on function public.feature_response(uuid, boolean) to authenticated;

-------------------------------------------------------------------------------
-- TV screens
-------------------------------------------------------------------------------

create table if not exists public.tv_screens (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]<>]'),
  token_hash    text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  survey_id     uuid references public.surveys(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  show_comments boolean not null default false,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  last_seen_at  timestamptz
);
create index if not exists tv_screens_account_idx on public.tv_screens (account_id, created_at desc);

alter table public.tv_screens enable row level security;
revoke all on public.tv_screens from anon, authenticated;
-- Never the token hash.
grant select (id, account_id, name, survey_id, location_id, show_comments, created_by, created_at, revoked_at, last_seen_at) on public.tv_screens to authenticated;
grant select, insert, update, delete on public.tv_screens to service_role;
drop policy if exists tv_screens_select on public.tv_screens;
create policy tv_screens_select on public.tv_screens for select to authenticated using (public.has_role(account_id, array['owner', 'admin']));
drop policy if exists tv_screens_mfa on public.tv_screens;
create policy tv_screens_mfa on public.tv_screens as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

create or replace function public.create_tv_screen(p_account uuid, p_name text, p_token_hash text, p_survey uuid, p_location uuid, p_show_comments boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if char_length(v_name) not between 1 and 60 or v_name ~ '[[:cntrl:]<>]' then raise exception 'invalid name' using errcode = '22023'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token' using errcode = '22023'; end if;
  if p_survey is not null and not exists (select 1 from public.surveys where id = p_survey and account_id = p_account) then perform private.forbid('not found'); end if;
  if p_location is not null and private.valid_location(p_account, p_location) is null then raise exception 'invalid location' using errcode = '22023'; end if;
  if (select count(*) from public.tv_screens where account_id = p_account and revoked_at is null) >= 20 then
    raise exception 'too many screens' using errcode = '54000';
  end if;
  insert into public.tv_screens (account_id, name, token_hash, survey_id, location_id, show_comments, created_by)
    values (p_account, v_name, p_token_hash, p_survey, p_location, coalesce(p_show_comments, false), auth.uid())
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_tv_screen(p_screen uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  select account_id into v_account from public.tv_screens where id = p_screen;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  update public.tv_screens set revoked_at = coalesce(revoked_at, now()) where id = p_screen;
end $$;

revoke all on function public.create_tv_screen(uuid, text, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_tv_screen(uuid, text, text, uuid, uuid, boolean) to authenticated;
revoke all on function public.revoke_tv_screen(uuid) from public, anon;
grant execute on function public.revoke_tv_screen(uuid) to authenticated;
