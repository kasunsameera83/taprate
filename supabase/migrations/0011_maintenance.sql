-- 0011: daily housekeeping (called by /api/cron/cleanup with the service key).
-- Keeps the database small and matches what the Privacy Policy promises about retention.

create or replace function public.maintenance_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rate integer; v_pending integer; v_orders integer; v_deliveries integer; v_alerts integer; v_audit integer; v_insights integer;
begin
  select public.rate_limit_cleanup() into v_rate;
  -- Clicks never confirmed by a real browser (mostly email scanners): 30 days.
  with d as (delete from public.responses where status = 'pending' and created_at < now() - interval '30 days' returning 1) select count(*) into v_pending from d;
  -- Checkouts that were started but never paid: closed after 7 days.
  with u as (update public.billing_orders set status = 'cancelled' where status = 'pending' and created_at < now() - interval '7 days' returning 1) select count(*) into v_orders from u;
  with d as (delete from public.integration_deliveries where created_at < now() - interval '90 days' returning 1) select count(*) into v_deliveries from d;
  with d as (delete from public.alerts_log where created_at < now() - interval '365 days' returning 1) select count(*) into v_alerts from d;
  with d as (delete from public.audit_log where created_at < now() - interval '730 days' returning 1) select count(*) into v_audit from d;
  with d as (delete from public.insights where created_at < now() - interval '365 days' returning 1) select count(*) into v_insights from d;
  return jsonb_build_object('rate_limits', v_rate, 'pending_clicks', v_pending, 'stale_orders', v_orders, 'deliveries', v_deliveries, 'alerts', v_alerts, 'audit', v_audit, 'insights', v_insights);
end $$;

revoke all on function public.maintenance_cleanup() from public, anon, authenticated;
grant execute on function public.maintenance_cleanup() to service_role;
