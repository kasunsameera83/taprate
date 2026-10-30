-- 0036: plan tiers for the newer features, and hiding "Feedback by TapTruly" on Growth and Scale.
-- Keep in step with src/lib/billing/features.ts (FEATURE_PLAN).
create or replace function private.plan_allows(p_plan text, p_feature text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_feature
    when 'own_domain'    then p_plan = 'scale'
    when 'custom_domain' then p_plan = 'scale'
    when 'white_label'   then coalesce(p_plan in ('growth', 'scale'), false)
    else coalesce(p_plan in ('starter', 'growth', 'scale'), false)
  end;
$$;
revoke all on function private.plan_allows(text, text) from public, anon, authenticated;

alter table public.accounts add column if not exists hide_branding boolean not null default false;
grant update (name, ai_insights_enabled, agent_wins_enabled, hide_branding) on public.accounts to authenticated;

create or replace function private.require_white_label_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.hide_branding and not old.hide_branding and not private.plan_allows(new.plan, 'white_label') then
    raise exception 'upgrade required: white_label' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.require_white_label_plan() from public, anon, authenticated;
drop trigger if exists accounts_white_label_plan on public.accounts;
create trigger accounts_white_label_plan before update of hide_branding on public.accounts
  for each row execute function private.require_white_label_plan();
