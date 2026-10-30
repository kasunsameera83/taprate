-- 0034: in-app notifications. Each team member has their own "seen up to" time per business, so the bell
-- shows what's new for THEM. Starts at "now" so nobody gets a flood of old ratings.
alter table public.memberships add column if not exists notifications_seen_at timestamptz not null default now();

-- Mark everything up to now as seen, for the signed-in user in one business they belong to.
create or replace function public.mark_notifications_seen(p_account uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform private.forbid(); end if;
  update public.memberships set notifications_seen_at = now()
   where account_id = p_account and user_id = auth.uid();
  if not found then perform private.forbid(); end if;
end $$;
revoke all on function public.mark_notifications_seen(uuid) from public, anon;
grant execute on function public.mark_notifications_seen(uuid) to authenticated;

-- Fast "anything new?" checks.
create index if not exists responses_account_confirmed_idx on public.responses (account_id, confirmed_at desc) where status = 'confirmed';
