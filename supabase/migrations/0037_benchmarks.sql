-- 0037: industry benchmarks. A business picks its industry; the dashboard compares its happy % with the
-- average of other businesses in the same industry over the last 90 days.
-- Privacy: only an average is returned, never names or numbers of any single business, and only when at
-- least 5 other businesses (each with 10+ ratings) are in that industry. Each business counts equally.
alter table public.accounts add column if not exists industry text
  check (industry is null or industry in ('restaurant', 'retail', 'ecommerce', 'healthcare', 'beauty', 'hospitality', 'education',
                                          'software', 'finance', 'automotive', 'services', 'other'));
grant update (name, ai_insights_enabled, agent_wins_enabled, hide_branding, industry) on public.accounts to authenticated;
create index if not exists accounts_industry_idx on public.accounts (industry) where industry is not null;

create or replace function public.industry_benchmark(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_industry text; v_mine numeric; v_avg numeric; v_n integer;
begin
  if not public.has_role(p_account, array['owner', 'admin', 'viewer', 'agent']) then perform private.forbid(); end if;
  select industry into v_industry from public.accounts where id = p_account;
  if v_industry is null then return jsonb_build_object('industry', null); end if;

  with per as (
    select r.account_id, count(*) as n, count(*) filter (where r.sentiment = 'positive') as pos
      from public.responses r
      join public.accounts a on a.id = r.account_id
     where a.industry = v_industry and a.suspended_at is null
       and r.status = 'confirmed' and r.confirmed_at > now() - interval '90 days' and r.sentiment is not null
     group by r.account_id
  )
  select
    (select round(100.0 * pos / nullif(n, 0)) from per where account_id = p_account),
    (select round(avg(100.0 * pos / n)) from per where account_id <> p_account and n >= 10),
    (select count(*) from per where account_id <> p_account and n >= 10)
  into v_mine, v_avg, v_n;

  return jsonb_build_object(
    'industry', v_industry,
    'mine', v_mine,
    'average', case when v_n >= 5 then v_avg else null end,
    'enough', v_n >= 5
  );
end $$;
revoke all on function public.industry_benchmark(uuid) from public, anon;
grant execute on function public.industry_benchmark(uuid) to authenticated;
