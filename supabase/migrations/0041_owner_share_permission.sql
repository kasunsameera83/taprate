-- 0041: share a happy comment on social media when the customer agreed outside TapTruly (for example on
-- WhatsApp). An owner or admin confirms "I have this customer's permission"; we record who and when. The
-- picture then never shows a name ("A happy customer"). It doesn't put the comment on the website wall:
-- that still needs the customer's own tick on the thank-you page.

alter table public.responses add column if not exists owner_share_by uuid references auth.users(id) on delete set null;
alter table public.responses add column if not exists owner_share_at timestamptz;
create index if not exists responses_owner_share_by_idx on public.responses (owner_share_by) where owner_share_by is not null;
alter table public.responses drop constraint if exists responses_owner_share_pair;
alter table public.responses add constraint responses_owner_share_pair check (owner_share_by is null or owner_share_at is not null);

-- An edited comment, or one that's no longer happy, needs permission again.
create or replace function private.owner_share_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.comment is null or new.sentiment is distinct from 'positive'
     or (tg_op = 'UPDATE' and new.comment is distinct from old.comment) then
    new.owner_share_at := null;
    new.owner_share_by := null;
  end if;
  return new;
end $$;
revoke all on function private.owner_share_rules() from public, anon, authenticated;
drop trigger if exists responses_owner_share on public.responses;
create trigger responses_owner_share before insert or update of comment, sentiment, owner_share_at, owner_share_by on public.responses
  for each row execute function private.owner_share_rules();

-- Owners and admins only (two-step sign-in done), happy confirmed comments only, in their own business.
create or replace function public.set_owner_share_permission(p_response uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.responses;
begin
  select * into r from public.responses where id = p_response;
  if not found then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(r.account_id, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if p_allowed and (r.comment is null or btrim(r.comment) = '' or r.sentiment is distinct from 'positive' or r.status <> 'confirmed') then
    raise exception 'not shareable' using errcode = '22023';
  end if;
  update public.responses
     set owner_share_at = case when p_allowed then coalesce(owner_share_at, now()) else null end,
         owner_share_by = case when p_allowed then coalesce(owner_share_by, auth.uid()) else null end
   where id = p_response;
end $$;
revoke all on function public.set_owner_share_permission(uuid, boolean) from public, anon;
grant execute on function public.set_owner_share_permission(uuid, boolean) to authenticated;

-- Signed-in users can read these like the rest of the row (row rules apply) but can't write them: only the
-- function above changes them.
