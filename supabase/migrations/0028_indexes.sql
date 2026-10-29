-- 0028: indexes from the performance review. Safe to run any time ("if not exists"); while tables are small
-- this takes seconds. Nothing here changes what anyone can see or do.

-- Customer lookups by email (customer history, "who rated after our email", erasing a customer's data).
-- A lower-case copy of the address, kept up to date by the database, so the lookup ignores capitals AND uses an index.
alter table public.responses add column if not exists respondent_email_lc text generated always as (lower(respondent_email)) stored;
create index if not exists responses_email_lc_idx on public.responses (account_id, respondent_email_lc, created_at desc) where respondent_email_lc is not null;
create index if not exists responses_survey_email_idx on public.responses (survey_id, respondent_email) where respondent_email is not null;

-- Follow-ups: "assigned to me", and the "won back" link to the original rating.
create index if not exists responses_assignee_idx on public.responses (account_id, assignee, due_at) where assignee is not null and followup_status is not null;
create index if not exists responses_recovery_of_idx on public.responses (recovery_of) where recovery_of is not null;
create index if not exists responses_resolved_by_idx on public.responses (resolved_by) where resolved_by is not null;

-- Links used when a business, survey, response, order or user is deleted (otherwise each delete scans the table)
-- and by billing, alerts and push lookups.
create index if not exists alerts_log_response_idx on public.alerts_log (response_id);
create index if not exists followup_notes_account_idx on public.followup_notes (account_id);
create index if not exists followup_notes_author_idx on public.followup_notes (author) where author is not null;
create index if not exists integration_deliveries_account_idx on public.integration_deliveries (account_id, created_at desc);
create index if not exists credit_adjustments_account_idx on public.credit_adjustments (account_id, created_at desc);
create index if not exists credit_adjustments_admin_idx on public.credit_adjustments (admin_id) where admin_id is not null;
create index if not exists promo_redemptions_account_idx on public.promo_redemptions (account_id);
create index if not exists promo_redemptions_order_idx on public.promo_redemptions (order_id);
create index if not exists billing_orders_promo_idx on public.billing_orders (promo_id) where promo_id is not null;
create index if not exists billing_payments_order_idx on public.billing_payments (order_id);
create index if not exists billing_payments_subscription_idx on public.billing_payments (subscription_id) where subscription_id is not null;
create index if not exists subscriptions_order_idx on public.subscriptions (order_id);
create index if not exists billing_events_account_idx on public.billing_events (account_id) where account_id is not null;
create index if not exists send_recipients_survey_idx on public.send_recipients (survey_id);
create index if not exists send_recipients_recovery_idx on public.send_recipients (recovery_of) where recovery_of is not null;
create index if not exists survey_sends_repeat_of_idx on public.survey_sends (repeat_of) where repeat_of is not null;
create index if not exists email_suppressions_account_idx on public.email_suppressions (account_id) where account_id is not null;
create index if not exists kiosks_survey_idx on public.kiosks (survey_id);
create index if not exists kiosks_location_idx on public.kiosks (location_id) where location_id is not null;
create index if not exists tv_screens_survey_idx on public.tv_screens (survey_id) where survey_id is not null;
create index if not exists tv_screens_location_idx on public.tv_screens (location_id) where location_id is not null;
create index if not exists insights_survey_idx on public.insights (survey_id) where survey_id is not null;
create index if not exists import_batches_survey_idx on public.import_batches (survey_id);
create index if not exists report_subscriptions_user_idx on public.report_subscriptions (user_id);
create index if not exists report_subscriptions_survey_idx on public.report_subscriptions (survey_id) where survey_id is not null;
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists audit_log_user_idx on public.audit_log (user_id) where user_id is not null;
create index if not exists invites_invited_by_idx on public.invites (invited_by) where invited_by is not null;
create index if not exists platform_audit_log_admin_idx on public.platform_audit_log (admin_id) where admin_id is not null;
-- When a user or branch is deleted, their ratings are updated in place: find them directly.
create index if not exists responses_assignee_only_idx on public.responses (assignee) where assignee is not null;
create index if not exists responses_location_only_idx on public.responses (location_id) where location_id is not null;
