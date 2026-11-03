-- 0039: running-low / out-of-responses emails to owners.
-- credit_alert_level remembers the last email sent (0 none, 1 running low, 2 out) so each is sent once,
-- and drops back when the business adds responses. Only the server (service role) writes it: it is NOT
-- in the columns signed-in users may update (see 0037's grant), and the existing RLS select policy applies.
alter table public.accounts add column if not exists credit_alert_level smallint not null default 0
  check (credit_alert_level between 0 and 2);

