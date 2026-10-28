import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { catalogFromRows, DEFAULT_CATALOG, type Catalog } from "@/lib/billing/catalog";

/** Current prices from the database (edited in /admin/pricing). Falls back to the defaults if unavailable. */
export async function loadCatalog(): Promise<Catalog> {
  const { data, error } = await adminClient()
    .from("billing_catalog")
    .select("item, kind, name, blurb, responses, lkr_month, lkr_year, usd_month, usd_year, lkr_price, usd_price, active, sort");
  if (error) {
    console.error("[billing] catalog unavailable, using defaults", { code: error.code });
    return DEFAULT_CATALOG;
  }
  return catalogFromRows(data);
}
