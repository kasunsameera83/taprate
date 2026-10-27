-- 0004: act on feedback.
--   * CES (customer effort, 1-7) rating scale
--   * Response drivers: customers tap the reasons behind their rating
--   * Closed loop: negative ratings become follow-ups with status, owner, due date and notes
--   * Thank-you page: "leave us a review" button for happy customers
--   * Business logo (stored in Supabase Storage, uploaded only through the server)

-------------------------------------------------------------------------------
-- CES scale
-------------------------------------------------------------------------------

alter table public.surveys drop constraint if exists surveys_icon_set_check;
alter table public.surveys
  add constraint surveys_icon_set_check check (icon_set in ('thumbs', 'faces3', 'faces5', 'stars5', 'nps', 'ces'));

create or replace function public.rating_max(p_icon_set text)
returns smallint language sql immutable set search_path = '' as $$
  select case p_icon_set
    when 'thumbs' then 2 when 'faces3' then 3 when 'faces5' then 5
    when 'stars5' then 5 when 'nps' then 10 when 'ces' then 7 end::smallint;
$$;

-- Thresholds MUST match src/lib/surveys/iconSets.ts (positiveFrom / negativeTo).
create or replace function public.rating_sentiment(p_icon_set text, p_rating smallint)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_rating is null then null
    when p_icon_set = 'thumbs' then case when p_rating >= 2 then 'positive' else 'negative' end
    when p_icon_set = 'faces3' then case when p_rating >= 3 then 'positive' when p_rating = 2 then 'neutral' else 'negative' end
    when p_icon_set in ('faces5', 'stars5') then case when p_rating >= 4 then 'positive' when p_rating = 3 then 'neutral' else 'negative' end
    when p_icon_set = 'nps' then case when p_rating >= 9 then 'positive' when p_rating >= 7 then 'neutral' else 'negative' end
    when p_icon_set = 'ces' then case when p_rating >= 5 then 'positive' when p_rating = 4 then 'neutral' else 'negative' end
  end;
$$;

-------------------------------------------------------------------------------
-- Survey settings
-------------------------------------------------------------------------------

create or replace function private.valid_labels(p_labels text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(p_labels) <= 8
     and not exists (select 1 from unnest(p_labels) l where l is null or char_length(btrim(l)) not between 1 and 40)
     and cardinality(p_labels) = (select count(distinct lower(l)) from unnest(p_labels) l);
$$;

alter table public.surveys
  add column if not exists drivers_positive text[] not null default '{}',
  add column if not exists drivers_negative text[] not null default '{}',
  add column if not exists review_cta_label text,
  add column if not exists review_cta_url text,
  add column if not exists followups_enabled boolean not null default true,
  add column if not exists followup_due_hours integer not null default 48;

alter table public.surveys drop constraint if exists surveys_drivers_check;
alter table public.surveys add constraint surveys_drivers_check
  check (private.valid_labels(drivers_positive) and private.valid_labels(drivers_negative));
alter table public.surveys drop constraint if exists surveys_review_cta_check;
alter table public.surveys add constraint surveys_review_cta_check check (
  (review_cta_label is null and review_cta_url is null)
  or (review_cta_label is not null and review_cta_url is not null
      and char_length(review_cta_label) between 1 and 40 and char_length(review_cta_url) <= 300
      and review_cta_url ~ '^https://[^\s"<>]+$')
);
alter table public.surveys drop constraint if exists surveys_followup_hours_check;
alter table public.surveys add constraint surveys_followup_hours_check check (followup_due_hours between 1 and 720);

grant update (drivers_positive, drivers_negative, review_cta_label, review_cta_url, followups_enabled, followup_due_hours)
  on public.surveys to authenticated;

-------------------------------------------------------------------------------
-- Responses: drivers + follow-up
-------------------------------------------------------------------------------

alter table public.responses
  add column if not exists drivers text[] not null default '{}',
  add column if not exists followup_status text check (followup_status in ('open', 'in_progress', 'resolved')),
  add column if not exists assignee uuid references auth.users(id) on delete set null,
  add column if not exists due_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists reminded_at timestamptz;

create index if not exists responses_followups_idx
  on public.responses (account_id, followup_status, due_at) where followup_status is not null;

-- Drivers must be labels the survey actually offers (positive list for positive ratings, otherwise negative list).
create or replace function private.check_drivers()
returns trigger language plpgsql set search_path = '' as $$
declare v_pos text[]; v_neg text[]; v_allowed text[];
begin
  -- Customer changed their rating to a different sentiment: earlier reasons no longer apply.
  if tg_op = 'UPDATE' and new.sentiment is distinct from old.sentiment then
    new.drivers := '{}';
    return new;
  end if;
  if new.drivers is null or cardinality(new.drivers) = 0 then
    new.drivers := '{}';
    return new;
  end if;
  if cardinality(new.drivers) > 8 then raise exception 'too many drivers'; end if;
  select drivers_positive, drivers_negative into v_pos, v_neg from public.surveys where id = new.survey_id;
  v_allowed := case when new.sentiment = 'positive' then v_pos else v_neg end;
  if exists (select 1 from unnest(new.drivers) d where not (d = any (v_allowed))) then
    raise exception 'invalid driver';
  end if;
  return new;
end $$;

drop trigger if exists responses_drivers on public.responses;
-- Same-timing triggers fire in name order, so "responses_zz_" runs after "responses_sentiment".
create trigger responses_zz_drivers before insert or update of drivers, rating on public.responses
  for each row execute function private.check_drivers();

-- A confirmed negative rating opens a follow-up automatically (when the survey has follow-ups on).
create or replace function private.open_followup()
returns trigger language plpgsql set search_path = '' as $$
declare v_enabled boolean; v_hours integer;
begin
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

drop trigger if exists responses_zy_followup on public.responses;
create trigger responses_zy_followup before insert or update of rating on public.responses
  for each row execute function private.open_followup();

-------------------------------------------------------------------------------
-- Follow-up notes
-------------------------------------------------------------------------------

create table if not exists public.followup_notes (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  response_id uuid not null references public.responses(id) on delete cascade,
  author      uuid references auth.users(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists followup_notes_response_idx on public.followup_notes (response_id, created_at);

alter table public.followup_notes enable row level security;
revoke all on public.followup_notes from anon, authenticated;
grant select on public.followup_notes to authenticated;
grant select, insert, update, delete on public.followup_notes to service_role;

create policy followup_notes_select on public.followup_notes for select to authenticated
  using (exists (
    select 1 from public.responses r
    where r.id = response_id and public.can_read_response(r.account_id, r.agent)
  ));
create policy followup_notes_mfa on public.followup_notes as restrictive for all to authenticated
  using (public.mfa_ok()) with check (public.mfa_ok());

-------------------------------------------------------------------------------
-- Follow-up functions (signed-in users)
-------------------------------------------------------------------------------

-- Owners/admins: change status, assignee and due date. Agents: change status of follow-ups
-- they can see and that are assigned to them. Viewers: read only.
create or replace function public.update_followup(
  p_response uuid, p_status text, p_assignee uuid, p_due_at timestamptz, p_set_assignee boolean, p_set_due boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare r public.responses; v_role text;
begin
  if not public.mfa_ok() then perform private.forbid(); end if;
  select * into r from public.responses where id = p_response for update;
  if not found or not public.can_read_response(r.account_id, r.agent) then perform private.forbid('not found'); end if;
  if r.followup_status is null then raise exception 'no follow-up for this response' using errcode = '22023'; end if;
  v_role := private.role_in(r.account_id, auth.uid());

  if v_role = 'agent' then
    if r.assignee is distinct from auth.uid() or p_set_assignee or p_set_due then perform private.forbid(); end if;
  elsif v_role not in ('owner', 'admin') then
    perform private.forbid();
  end if;

  if p_status is not null and p_status not in ('open', 'in_progress', 'resolved') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_set_assignee and p_assignee is not null and private.role_in(r.account_id, p_assignee) is null then
    raise exception 'assignee must be a team member' using errcode = '22023';
  end if;
  if p_set_due and p_due_at is not null and (p_due_at < now() - interval '1 day' or p_due_at > now() + interval '365 days') then
    raise exception 'invalid due date' using errcode = '22023';
  end if;

  update public.responses set
    followup_status = coalesce(p_status, followup_status),
    assignee = case when p_set_assignee then p_assignee else assignee end,
    due_at = case when p_set_due then p_due_at else due_at end,
    resolved_at = case when coalesce(p_status, followup_status) = 'resolved' then coalesce(resolved_at, now()) else null end,
    resolved_by = case when coalesce(p_status, followup_status) = 'resolved' then coalesce(resolved_by, auth.uid()) else null end,
    reminded_at = case when p_set_due then null else reminded_at end
  where id = p_response;
end $$;

create or replace function public.add_followup_note(p_response uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.responses; v_role text; v_body text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  if not public.mfa_ok() then perform private.forbid(); end if;
  select * into r from public.responses where id = p_response;
  if not found or not public.can_read_response(r.account_id, r.agent) then perform private.forbid('not found'); end if;
  v_role := private.role_in(r.account_id, auth.uid());
  if v_role not in ('owner', 'admin', 'agent') then perform private.forbid(); end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'invalid note' using errcode = '22023'; end if;
  if (select count(*) from public.followup_notes where response_id = p_response) >= 100 then
    raise exception 'too many notes' using errcode = '54000';
  end if;
  insert into public.followup_notes (account_id, response_id, author, body)
    values (r.account_id, p_response, auth.uid(), v_body) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.update_followup(uuid, text, uuid, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.update_followup(uuid, text, uuid, timestamptz, boolean, boolean) to authenticated;
revoke all on function public.add_followup_note(uuid, text) from public, anon;
grant execute on function public.add_followup_note(uuid, text) to authenticated;

-------------------------------------------------------------------------------
-- Logo
-------------------------------------------------------------------------------

alter table public.accounts
  add column if not exists logo_path text check (logo_path is null or logo_path ~ '^accounts/[0-9a-f-]{36}/logo-[A-Za-z0-9_-]{8,40}\.(png|jpg|webp)$');
-- No user grant on logo_path: only the server (after checking the file) sets it.

-- Public bucket for logos (Supabase only; skipped on plain Postgres). Writes only via the service role.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('logos', 'logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 524288, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;
