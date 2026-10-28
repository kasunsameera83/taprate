-- 0006: integrations & API.
--   * API keys for the public API (only a hash of each key is stored; revocable; optional expiry)
--   * CSV import of past ratings (validated again here; undo = delete the import batch)
--   * Zendesk / Freshdesk post-back (new integration kinds; credentials stored encrypted by the server)

-------------------------------------------------------------------------------
-- API keys
-------------------------------------------------------------------------------

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes       text[] not null check (scopes <@ array['read', 'write']::text[] and 'read' = any (scopes) and cardinality(scopes) between 1 and 2),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz
);
create index if not exists api_keys_account_idx on public.api_keys (account_id, created_at desc);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
-- token_hash is never selectable by users.
grant select (id, account_id, name, scopes, created_by, created_at, expires_at, revoked_at, last_used_at) on public.api_keys to authenticated;
grant select, insert, update, delete on public.api_keys to service_role;
create policy api_keys_select on public.api_keys for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));
create policy api_keys_mfa on public.api_keys as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

create or replace function public.create_api_key(p_account uuid, p_name text, p_scopes text[], p_token_hash text, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid name' using errcode = '22023'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid token' using errcode = '22023'; end if;
  if p_scopes is null or not (p_scopes <@ array['read', 'write']::text[]) or not ('read' = any (p_scopes)) then
    raise exception 'invalid scopes' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at < now() + interval '1 hour' or p_expires_at > now() + interval '2 years') then
    raise exception 'invalid expiry' using errcode = '22023';
  end if;
  if (select count(*) from public.api_keys where account_id = p_account and revoked_at is null) >= 25 then
    raise exception 'too many api keys' using errcode = '54000';
  end if;
  insert into public.api_keys (account_id, name, token_hash, scopes, created_by, expires_at)
    values (p_account, v_name, p_token_hash, (select array_agg(distinct s order by s) from unnest(p_scopes) s), auth.uid(), p_expires_at)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.revoke_api_key(p_key uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  select account_id into v_account from public.api_keys where id = p_key;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now()) where id = p_key;
end $$;

revoke all on function public.create_api_key(uuid, text, text[], text, timestamptz) from public, anon;
grant execute on function public.create_api_key(uuid, text, text[], text, timestamptz) to authenticated;
revoke all on function public.revoke_api_key(uuid) from public, anon;
grant execute on function public.revoke_api_key(uuid) to authenticated;

-------------------------------------------------------------------------------
-- CSV import of past ratings
-------------------------------------------------------------------------------

alter table public.responses drop constraint if exists responses_channel_check;
alter table public.responses add constraint responses_channel_check
  check (channel in ('email', 'qr', 'whatsapp', 'sms', 'link', 'web', 'kiosk', 'import'));

create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  survey_id   uuid not null references public.surveys(id) on delete cascade,
  file_name   text not null check (char_length(file_name) between 1 and 120),
  row_count   integer not null default 0 check (row_count >= 0),
  skipped     integer not null default 0 check (skipped >= 0),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists import_batches_account_idx on public.import_batches (account_id, created_at desc);

alter table public.import_batches enable row level security;
revoke all on public.import_batches from anon, authenticated;
grant select on public.import_batches to authenticated;
grant select, insert, update, delete on public.import_batches to service_role;
create policy import_batches_select on public.import_batches for select to authenticated
  using (public.has_role(account_id, array['owner', 'admin']));
create policy import_batches_mfa on public.import_batches as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-- Undoing an import deletes its batch, and the batch's ratings with it.
alter table public.responses add column if not exists import_batch uuid references public.import_batches(id) on delete cascade;
create index if not exists responses_import_batch_idx on public.responses (import_batch) where import_batch is not null;

-- Imported history must not open follow-ups for old complaints.
create or replace function private.open_followup()
returns trigger language plpgsql set search_path = '' as $$
declare v_enabled boolean; v_hours integer;
begin
  if new.channel = 'import' then return new; end if;
  if new.sentiment = 'negative' and new.followup_status is null
     and (tg_op = 'INSERT' or old.sentiment is distinct from 'negative') then
    select followups_enabled, followup_due_hours into v_enabled, v_hours from public.surveys where id = new.survey_id;
    if v_enabled then
      new.followup_status := 'open';
      new.due_at := now() + make_interval(hours => v_hours);
    end if;
  end if;
  return new;
end $$;

-- Rows arrive already validated by the server; every rule is checked again here.
-- Each row: {"date": "<ISO UTC>", "rating": n, "email"?, "comment"?, "agent"?, "ticket"?}
-- Identical rows (same date, rating, email, ticket, comment) are skipped, so importing a file twice is harmless.
create or replace function public.import_responses(p_account uuid, p_survey uuid, p_file_name text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text; v_batch uuid; v_total integer; v_inserted integer; v_name text := btrim(coalesce(p_file_name, ''));
begin
  if not public.mfa_ok() or coalesce(private.role_in(p_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  select status into v_status from public.surveys where id = p_survey and account_id = p_account;
  if v_status is null then perform private.forbid('not found'); end if;
  if v_status = 'archived' then raise exception 'survey is archived' using errcode = '22023'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'invalid file name' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid rows' using errcode = '22023'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total not between 1 and 5000 then raise exception 'invalid row count' using errcode = '22023'; end if;
  if (select count(*) from public.import_batches where account_id = p_account and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many imports' using errcode = '54000';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) <> 'object'
       or exists (select 1 from jsonb_object_keys(r) k where k not in ('date', 'rating', 'email', 'comment', 'agent', 'ticket'))
       or jsonb_typeof(r -> 'rating') is distinct from 'number' or (r ->> 'rating') !~ '^\d{1,2}$'
       or jsonb_typeof(r -> 'date') is distinct from 'string'
       or (r ->> 'date') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
       or (r ? 'email' and (jsonb_typeof(r -> 'email') <> 'string' or char_length(r ->> 'email') > 254 or (r ->> 'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
       or (r ? 'comment' and (jsonb_typeof(r -> 'comment') <> 'string' or char_length(r ->> 'comment') not between 1 and 2000))
       or (r ? 'agent' and (jsonb_typeof(r -> 'agent') <> 'string' or char_length(r ->> 'agent') not between 1 and 100))
       or (r ? 'ticket' and (jsonb_typeof(r -> 'ticket') <> 'string' or (r ->> 'ticket') !~ '^[A-Za-z0-9#._/-]{1,100}$'))
  ) then
    raise exception 'invalid import row' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where (r ->> 'date')::timestamptz < timestamptz '2000-01-01' or (r ->> 'date')::timestamptz > now() + interval '1 day'
  ) then
    raise exception 'invalid import date' using errcode = '22023';
  end if;

  insert into public.import_batches (account_id, survey_id, file_name, created_by)
    values (p_account, p_survey, v_name, auth.uid()) returning id into v_batch;

  -- Ratings outside the survey's scale are refused by the responses_check trigger (whole import fails).
  insert into public.responses (
    account_id, survey_id, rating, status, comment, respondent_email, agent, ticket_ref,
    dedupe_key, channel, credited, created_at, confirmed_at, import_batch
  )
  select p_account, p_survey, (r ->> 'rating')::smallint, 'confirmed', r ->> 'comment', lower(r ->> 'email'), r ->> 'agent', r ->> 'ticket',
         encode(sha256(convert_to(json_build_array('import:v1', r ->> 'date', r ->> 'rating', lower(r ->> 'email'), r ->> 'ticket', r ->> 'comment')::text, 'UTF8')), 'hex'),
         'import', false, (r ->> 'date')::timestamptz, (r ->> 'date')::timestamptz, v_batch
  from jsonb_array_elements(p_rows) r
  on conflict (survey_id, dedupe_key) do nothing;
  get diagnostics v_inserted = row_count;

  update public.import_batches set row_count = v_inserted, skipped = v_total - v_inserted where id = v_batch;
  return jsonb_build_object('batch', v_batch, 'inserted', v_inserted, 'skipped', v_total - v_inserted);
end $$;

create or replace function public.delete_import(p_batch uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_account uuid; v_count integer;
begin
  select account_id into v_account from public.import_batches where id = p_batch;
  if v_account is null then perform private.forbid('not found'); end if;
  if not public.mfa_ok() or coalesce(private.role_in(v_account, auth.uid()), '') not in ('owner', 'admin') then perform private.forbid(); end if;
  select count(*) into v_count from public.responses where import_batch = p_batch;
  delete from public.import_batches where id = p_batch;
  return v_count;
end $$;

revoke all on function public.import_responses(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.import_responses(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.delete_import(uuid) from public, anon;
grant execute on function public.delete_import(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Zendesk / Freshdesk post-back
-------------------------------------------------------------------------------

alter table public.integrations drop constraint if exists integrations_kind_check;
alter table public.integrations add constraint integrations_kind_check
  check (kind in ('slack', 'teams', 'webhook', 'zendesk', 'freshdesk'));
