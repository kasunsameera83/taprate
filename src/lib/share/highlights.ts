import "server-only";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/server";
import { buildHighlightsToken } from "@/lib/security/signing";
import { planAllows, showBranding } from "@/lib/billing/features";
import { logoUrl } from "@/lib/branding";

export type Highlights = {
  accountId: string;
  month: string; // YYYY-MM
  monthLabel: string; // "October 2026"
  businessName: string;
  logo: string | null;
  total: number;
  happyPct: number;
  quote: { text: string; name: string } | null;
  branding: boolean;
};

const TZ = "Asia/Colombo";

/** "2026-10" for now (or last month), in Sri Lanka time. */
export function monthKey(which: "current" | "previous", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(now);
  let y = Number(parts.find((p) => p.type === "year")!.value);
  let m = Number(parts.find((p) => p.type === "month")!.value);
  if (which === "previous") {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function bounds(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  // Month boundaries in Sri Lanka time (UTC+05:30, no daylight saving).
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0) - 330 * 60_000).toISOString();
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0) - 330 * 60_000).toISOString();
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from, to, label };
}

/**
 * One business's month: number of ratings, % happy and (only if a customer agreed to social sharing) one
 * kind comment. Null when the business can't share (free plan, suspended) or had no ratings that month.
 */
export async function loadHighlights(accountId: string, month: string): Promise<Highlights | null> {
  const db = adminClient();
  const { data: acct } = await db.from("accounts").select("name, logo_path, plan, hide_branding, suspended_at").eq("id", accountId).maybeSingle();
  if (!acct || acct.suspended_at || !planAllows(acct.plan as string, "social")) return null;
  const { from, to, label } = bounds(month);
  const base = () => db.from("responses").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("status", "confirmed").gte("confirmed_at", from).lt("confirmed_at", to);
  const [{ count: total }, { count: happy }, { data: quote }] = await Promise.all([
    base().not("sentiment", "is", null),
    base().eq("sentiment", "positive"),
    db
      .from("responses")
      .select("comment, display_name")
      .eq("account_id", accountId)
      .eq("status", "confirmed")
      .eq("sentiment", "positive")
      .eq("share_consent", true)
      .eq("share_social", true)
      .not("comment", "is", null)
      .gte("confirmed_at", from)
      .lt("confirmed_at", to)
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!total) return null;
  const text = typeof quote?.comment === "string" ? quote.comment.trim() : "";
  return {
    accountId,
    month,
    monthLabel: label,
    businessName: acct.name as string,
    logo: logoUrl(acct.logo_path as string | null),
    total,
    happyPct: Math.round(((happy ?? 0) / total) * 100),
    quote: text ? { text: text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text, name: (quote?.display_name as string | null)?.trim() || "A happy customer" } : null,
    branding: showBranding(acct.plan as string, acct.hide_branding as boolean),
  };
}

export function highlightsUrls(accountId: string, month: string) {
  const e = env();
  const token = buildHighlightsToken(e.LINK_SIGNING_SECRET, accountId, month);
  const page = `${e.appOrigin}/h/${token}`;
  return { token, page, image: `${page}/image`, square: `${page}/image?size=square` };
}
