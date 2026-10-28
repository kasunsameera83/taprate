-- 0015: Sinhala and Tamil for customer-facing pages, and your own wording for the "reasons" question.
--   * Each survey has a language for what CUSTOMERS see (rating labels, thank-you page, kiosk, emails).
--   * Sinhala and Tamil are offered to Sri Lankan businesses (switched on automatically for sign-ups from
--     Sri Lanka and for businesses billed in Sri Lanka). The product owner can switch them on for anyone.
--   * Businesses can't switch the option on for themselves: there is no grant on the column.

alter table public.accounts add column if not exists local_languages boolean not null default false;

-- Businesses already paying from Sri Lanka get it now.
update public.accounts a set local_languages = true
where not a.local_languages and (
  exists (select 1 from public.billing_profiles b where b.account_id = a.id and b.country = 'LK')
  or exists (select 1 from public.billing_orders o where o.account_id = a.id and o.currency = 'LKR')
);

alter table public.surveys add column if not exists language text not null default 'en' check (language in ('en', 'si', 'ta'));
alter table public.surveys add column if not exists reasons_question_positive text
  check (reasons_question_positive is null or (char_length(reasons_question_positive) between 1 and 80 and reasons_question_positive !~ '[[:cntrl:]<>]'));
alter table public.surveys add column if not exists reasons_question_negative text
  check (reasons_question_negative is null or (char_length(reasons_question_negative) between 1 and 80 and reasons_question_negative !~ '[[:cntrl:]<>]'));
grant update (language, reasons_question_positive, reasons_question_negative) on public.surveys to authenticated;

create or replace function private.check_survey_language()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.language <> 'en' and (tg_op = 'INSERT' or new.language is distinct from old.language)
     and not coalesce((select a.local_languages from public.accounts a where a.id = new.account_id), false) then
    raise exception 'language not available' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists surveys_language_check on public.surveys;
create trigger surveys_language_check before insert or update of language on public.surveys
  for each row execute function private.check_survey_language();

-- Server only: called when someone signs up or creates a business from Sri Lanka.
create or replace function public.enable_local_languages(p_account uuid)
returns void language sql security definer set search_path = '' as $$
  update public.accounts set local_languages = true where id = p_account;
$$;
revoke all on function public.enable_local_languages(uuid) from public, anon, authenticated;
grant execute on function public.enable_local_languages(uuid) to service_role;

-- New accounts made by a person signing up (used right after sign-up, which happens on our server).
create or replace function public.enable_local_languages_for_new_user(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  update public.accounts a set local_languages = true
  where a.created_at > now() - interval '1 hour'
    and exists (select 1 from public.memberships m where m.account_id = a.id and m.user_id = p_user and m.role = 'owner');
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.enable_local_languages_for_new_user(uuid) from public, anon, authenticated;
grant execute on function public.enable_local_languages_for_new_user(uuid) to service_role;

-- The product owner switches it for any business.
create or replace function public.admin_set_local_languages(p_account uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  update public.accounts set local_languages = coalesce(p_enabled, false) where id = p_account;
  if not found then perform private.forbid('not found'); end if;
end $$;
revoke all on function public.admin_set_local_languages(uuid, boolean) from public, anon;
grant execute on function public.admin_set_local_languages(uuid, boolean) to authenticated;

create or replace function public.admin_account_detail(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then perform private.forbid(); end if;
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'plan', a.plan, 'credits', a.credit_balance, 'created_at', a.created_at,
    'suspended_at', a.suspended_at, 'suspended_reason', a.suspended_reason, 'local_languages', a.local_languages,
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
