-- 0012: custom rating icons and labels per survey.
--   * icon_images: { "<rating value>": "<storage path>" }. Set ONLY by the server after it has checked
--     the uploaded file (type from its bytes, size, dimensions, not animated, metadata removed).
--   * option_labels: { "<rating value>": "<label>" }, editable by owners/admins like other survey fields.
--   * The database checks both again: keys must be ratings on the survey's scale, image paths must sit in
--     this survey's own folder, labels must be short plain text.

alter table public.surveys add column if not exists icon_images jsonb not null default '{}'::jsonb
  check (jsonb_typeof(icon_images) = 'object' and pg_column_size(icon_images) < 4096);
alter table public.surveys add column if not exists option_labels jsonb not null default '{}'::jsonb
  check (jsonb_typeof(option_labels) = 'object' and pg_column_size(option_labels) < 4096);

grant update (option_labels) on public.surveys to authenticated;
-- No user grant on icon_images.

create or replace function private.check_survey_custom()
returns trigger language plpgsql set search_path = '' as $$
declare k text; v jsonb; v_min integer; v_max integer;
begin
  -- Custom pictures and labels belong to one scale; switching scale clears them.
  if tg_op = 'UPDATE' and new.icon_set <> old.icon_set then
    new.icon_images := '{}'::jsonb;
    new.option_labels := '{}'::jsonb;
  end if;
  v_min := public.rating_min(new.icon_set);
  v_max := public.rating_max(new.icon_set);

  for k, v in select * from jsonb_each(new.icon_images) loop
    if new.icon_set not in ('thumbs', 'faces3', 'faces5', 'stars5') then raise exception 'custom icons not allowed for this scale'; end if;
    if k !~ '^\d{1,2}$' or k::integer < v_min or k::integer > v_max then raise exception 'invalid icon rating'; end if;
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ ('^accounts/' || new.account_id::text || '/surveys/' || new.id::text || '/icon-\d{1,2}-[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$') then
      raise exception 'invalid icon path';
    end if;
  end loop;

  for k, v in select * from jsonb_each(new.option_labels) loop
    if k !~ '^\d{1,2}$' or k::integer < v_min or k::integer > v_max then raise exception 'invalid label rating'; end if;
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 24 or (v #>> '{}') ~ '[[:cntrl:]<>]' then
      raise exception 'invalid option label';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists surveys_custom_check on public.surveys;
create trigger surveys_custom_check before insert or update on public.surveys
  for each row execute function private.check_survey_custom();

-- Public bucket for survey icons (Supabase only). 200 KB, PNG/JPEG/WebP only. Writes only via the server.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('survey-icons', 'survey-icons', true, 204800, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 204800, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  end if;
end $$;
