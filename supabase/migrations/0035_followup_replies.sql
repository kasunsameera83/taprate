-- 0035: reply to an unhappy customer straight from a follow-up. The reply is emailed by the server and
-- kept on the follow-up's history (as a note of kind 'reply'). Paid plans; owners, admins and agents who
-- can see the rating. Never to addresses that bounced or complained; at most 200 replies a day per business.
alter table public.followup_notes add column if not exists kind text not null default 'note' check (kind in ('note', 'reply'));
alter table public.followup_notes add column if not exists sent_to text check (sent_to is null or char_length(sent_to) <= 254);
alter table public.followup_notes add column if not exists subject text check (subject is null or char_length(subject) between 1 and 150);
alter table public.followup_notes add column if not exists send_status text check (send_status is null or send_status in ('sending', 'sent', 'failed'));
alter table public.followup_notes drop constraint if exists followup_notes_reply_fields;
alter table public.followup_notes add constraint followup_notes_reply_fields
  check (kind = 'note' or (sent_to is not null and subject is not null and send_status is not null));
create index if not exists followup_notes_replies_day_idx on public.followup_notes (account_id, created_at) where kind = 'reply';

create or replace function public.record_followup_reply(p_response uuid, p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.responses; v_role text; v_body text := btrim(coalesce(p_body, '')); v_subject text := btrim(coalesce(p_subject, '')); v_id uuid; v_email text;
begin
  if not public.mfa_ok() then perform private.forbid(); end if;
  select * into r from public.responses where id = p_response;
  if not found or not public.can_read_response(r.account_id, r.agent) then perform private.forbid('not found'); end if;
  v_role := private.role_in(r.account_id, auth.uid());
  if v_role not in ('owner', 'admin', 'agent') then perform private.forbid(); end if;
  if not private.account_allows(r.account_id, 'replies') then raise exception 'upgrade required: replies' using errcode = '42501'; end if;
  if (select suspended_at from public.accounts where id = r.account_id) is not null then raise exception 'business is suspended' using errcode = '42501'; end if;
  v_email := lower(btrim(coalesce(r.respondent_email, '')));
  if v_email = '' or v_email !~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$' then raise exception 'no customer email' using errcode = '22023'; end if;
  if char_length(v_body) not between 1 and 2000 then raise exception 'invalid note' using errcode = '22023'; end if;
  if char_length(v_subject) not between 1 and 150 or v_subject ~ '[\r\n]' then raise exception 'invalid subject' using errcode = '22023'; end if;
  if exists (select 1 from public.email_suppressions s where s.email = v_email and s.reason in ('bounced', 'complained')
             and (s.account_id is null or s.account_id = r.account_id)) then
    raise exception 'customer email blocked' using errcode = '22023';
  end if;
  perform 1 from public.accounts where id = r.account_id for update;
  if (select count(*) from public.followup_notes where account_id = r.account_id and kind = 'reply' and created_at > now() - interval '1 day') >= 200 then
    raise exception 'daily reply limit reached' using errcode = '54000';
  end if;
  if (select count(*) from public.followup_notes where response_id = p_response) >= 100 then
    raise exception 'too many notes' using errcode = '54000';
  end if;
  insert into public.followup_notes (account_id, response_id, author, body, kind, sent_to, subject, send_status)
    values (r.account_id, p_response, auth.uid(), v_body, 'reply', v_email, v_subject, 'sending') returning id into v_id;
  return jsonb_build_object('id', v_id, 'email', v_email, 'survey', r.survey_id, 'comment', r.comment);
end $$;
revoke all on function public.record_followup_reply(uuid, text, text) from public, anon;
grant execute on function public.record_followup_reply(uuid, text, text) to authenticated;
