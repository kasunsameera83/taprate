-- 0024: Front (ratings added as internal comments on the conversation they were given for).
-- The API token is stored encrypted by the server, like the other helpdesks.

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('slack', 'teams', 'webhook', 'zendesk', 'freshdesk', 'gorgias', 'intercom', 'front', 'shopify'));
