-- 0019: phone and desktop alerts (Web Push). Each person turns them on per device; only the server sends.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  endpoint     text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh       text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth         text not null check (auth ~ '^[A-Za-z0-9_-]{20,30}$'),
  device       text check (device is null or (char_length(device) <= 80 and device !~ '[[:cntrl:]<>]')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_account_idx on public.push_subscriptions (account_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- People see their own devices (never the keys).
grant select (id, user_id, account_id, device, created_at, last_used_at) on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subscriptions_mfa on public.push_subscriptions;
create policy push_subscriptions_mfa on public.push_subscriptions as restrictive for all to authenticated using (public.mfa_ok()) with check (public.mfa_ok());

create or replace function public.save_push_subscription(p_account uuid, p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.mfa_ok() or private.role_in(p_account, auth.uid()) is null then perform private.forbid(); end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.push_subscriptions where id = (select id from public.push_subscriptions where user_id = auth.uid() order by coalesce(last_used_at, created_at) limit 1);
  end if;
  insert into public.push_subscriptions (user_id, account_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_account, p_endpoint, p_p256dh, p_auth, nullif(left(btrim(coalesce(p_device, '')), 80), ''))
  on conflict (endpoint) do update set user_id = excluded.user_id, account_id = excluded.account_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_push_subscription(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.mfa_ok() then perform private.forbid(); end if;
  delete from public.push_subscriptions where id = p_id and user_id = auth.uid();
end $$;

revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;
revoke all on function public.delete_push_subscription(uuid) from public, anon;
grant execute on function public.delete_push_subscription(uuid) to authenticated;
