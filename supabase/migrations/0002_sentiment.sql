-- 0002: sentiment (positive / neutral / negative) on each confirmed response.
-- Lets the app filter "needs follow-up" across surveys that use different rating scales.
-- Thresholds MUST match src/lib/surveys/iconSets.ts (positiveFrom / negativeTo).

create or replace function public.rating_sentiment(p_icon_set text, p_rating smallint)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_rating is null then null
    when p_icon_set = 'thumbs' then case when p_rating >= 2 then 'positive' else 'negative' end
    when p_icon_set = 'faces3' then case when p_rating >= 3 then 'positive' when p_rating = 2 then 'neutral' else 'negative' end
    when p_icon_set in ('faces5', 'stars5') then case when p_rating >= 4 then 'positive' when p_rating = 3 then 'neutral' else 'negative' end
    when p_icon_set = 'nps' then case when p_rating >= 9 then 'positive' when p_rating >= 7 then 'neutral' else 'negative' end
  end;
$$;
revoke all on function public.rating_sentiment(text, smallint) from public, anon;
grant execute on function public.rating_sentiment(text, smallint) to authenticated, service_role;

alter table public.responses
  add column if not exists sentiment text check (sentiment in ('positive', 'neutral', 'negative'));

-- Keep sentiment in step with the confirmed rating. Users can't write responses at all,
-- so this trigger is the only thing that sets the column.
create or replace function private.set_sentiment()
returns trigger language plpgsql set search_path = '' as $$
declare v_set text;
begin
  select icon_set into v_set from public.surveys where id = new.survey_id;
  new.sentiment := public.rating_sentiment(v_set, new.rating);
  return new;
end $$;

drop trigger if exists responses_sentiment on public.responses;
create trigger responses_sentiment before insert or update of rating on public.responses
  for each row execute function private.set_sentiment();

-- Backfill existing confirmed responses.
update public.responses r
set sentiment = public.rating_sentiment(s.icon_set, r.rating)
from public.surveys s
where s.id = r.survey_id and r.rating is not null;

create index if not exists responses_account_sentiment_idx
  on public.responses (account_id, sentiment, created_at desc)
  where status = 'confirmed';
