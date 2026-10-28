-- 0023: Gorgias and Intercom (rating notes on tickets/conversations) and Shopify (survey email after an order).
-- Credentials and signing secrets stay encrypted by the server, exactly like the other integrations.

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('slack', 'teams', 'webhook', 'zendesk', 'freshdesk', 'gorgias', 'intercom', 'shopify'));

-- Shopify: which survey to email. Only Shopify connections have one, and it must be the same business's survey.
alter table public.integrations add column if not exists survey_id uuid references public.surveys(id) on delete cascade;
alter table public.integrations drop constraint if exists integrations_survey_kind;
alter table public.integrations add constraint integrations_survey_kind check ((kind = 'shopify') = (survey_id is not null));
create index if not exists integrations_survey_idx on public.integrations (survey_id) where survey_id is not null;

create or replace function private.integration_survey_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.survey_id is not null and not exists (select 1 from public.surveys s where s.id = new.survey_id and s.account_id = new.account_id) then
    raise exception 'survey not found' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.integration_survey_guard() from public, anon, authenticated;
drop trigger if exists integrations_survey_guard on public.integrations;
create trigger integrations_survey_guard before insert or update of survey_id, account_id on public.integrations
  for each row execute function private.integration_survey_guard();

grant select (survey_id) on public.integrations to authenticated;
