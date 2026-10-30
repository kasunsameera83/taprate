import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { catalogFromRows, DEFAULT_CATALOG, freeFromRow, type Catalog } from "@/lib/billing/catalog";

/** Current prices and free plan from the database (edited in /admin/pricing). Falls back to the defaults if unavailable. */
export async function loadCatalog(): Promise<Catalog> {
  const db = adminClient();
  const [cat, settings] = await Promise.all([
    db.from("billing_catalog").select("item, kind, name, blurb, responses, lkr_month, lkr_year, usd_month, usd_year, lkr_price, usd_price, active, sort"),
    db.from("platform_settings").select("free_responses, free_daily_emails").eq("id", true).maybeSingle(),
  ]);
  if (settings.error) console.error("[billing] free plan settings unavailable, using defaults", { code: settings.error.code });
  const free = freeFromRow(settings.data);
  if (cat.error) {
    console.error("[billing] catalog unavailable, using defaults", { code: cat.error.code });
    return { ...DEFAULT_CATALOG, free };
  }
  return catalogFromRows(cat.data, free);
}
