-- 0033: social media share cards need their own consent. Customers who ticked the old box agreed to their
-- comment being shown on the business's WEBSITE only; from now on the box says "website and social media"
-- and that wider consent is recorded here. Share cards require it; the website wall keeps using share_consent.
alter table public.responses add column if not exists share_social boolean not null default false;
alter table public.responses drop constraint if exists responses_social_needs_consent;
alter table public.responses add constraint responses_social_needs_consent check (not share_social or share_consent);

-- Withdrawing consent removes both; an edited comment needs the customer's consent again for social media.
create or replace function private.share_consent_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not new.share_consent then
    new.display_name := null;
    new.featured_at := null;
    new.share_social := false;
  end if;
  if new.comment is null or new.sentiment is distinct from 'positive' then
    new.featured_at := null;
    new.share_social := false;
  end if;
  -- An edited comment must be approved again before it shows on the website.
  if tg_op = 'UPDATE' and new.comment is distinct from old.comment then
    new.featured_at := null;
  end if;
  return new;
end $$;
drop trigger if exists responses_share_consent on public.responses;
create trigger responses_share_consent before insert or update of share_consent, share_social, display_name, featured_at, comment, sentiment on public.responses
  for each row execute function private.share_consent_rules();
revoke all on function private.share_consent_rules() from public, anon, authenticated;
