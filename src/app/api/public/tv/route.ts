import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { secureRoute, ok, fail } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { parseKioskToken } from "@/lib/security/signing";
import { adminClient } from "@/lib/supabase/server";
import { isIconSetId, sentimentOf, type Sentiment } from "@/lib/surveys/iconSets";
import { planAllows } from "@/lib/billing/features";

const body = z.object({ token: z.string().max(100) }).strict();

type Row = { rating: number | null; comment: string | null; created_at: string; location_id: string | null; sentiment: Sentiment | null; surveys: { icon_set: string } | null };

const colomboDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date(t));

// Live numbers for an office TV screen. No sign-in: the secret link proves which screen it is (only its
// hash is stored). Never returns customer emails, names or ticket numbers.
export const POST = secureRoute<undefined, undefined, z.infer<typeof body>, "public">(
  { auth: "public", action: null, ipLimit: LIMITS.publicPerIp, body, maxBodyBytes: 256 },
  async ({ body: b, requestId }) => {
    const parsed = parseKioskToken(b.token); // same "<id>.<43-char secret>" shape as kiosk links
    if (!parsed) return fail("not_found", undefined, undefined, requestId);
    const db = adminClient();
    const { data: screen } = await db
      .from("tv_screens")
      .select("id, account_id, name, token_hash, survey_id, location_id, show_comments, revoked_at")
      .eq("id", parsed.kioskId)
      .maybeSingle();
    const hash = createHash("sha256").update(parsed.secret).digest("hex");
    if (!screen || screen.revoked_at || !timingSafeEqual(Buffer.from(hash), Buffer.from(screen.token_hash))) return fail("not_found", "This screen link isn't valid any more.", undefined, requestId);

    const now = Date.now();
    const since = new Date(now - 7 * 86_400_000).toISOString();
    let q = db
      .from("responses")
      .select("rating, comment, created_at, location_id, sentiment, surveys(icon_set)")
      .eq("account_id", screen.account_id)
      .eq("status", "confirmed")
      .gte("created_at", since);
    if (screen.survey_id) q = q.eq("survey_id", screen.survey_id);
    if (screen.location_id) q = q.eq("location_id", screen.location_id);
    const [{ data: rows }, { data: acct }, { data: locs }, { count: openFollowups }] = await Promise.all([
      q.order("created_at", { ascending: false }).limit(5000),
      db.from("accounts").select("name, logo_path, suspended_at, plan").eq("id", screen.account_id).maybeSingle(),
      db.from("locations").select("id, name").eq("account_id", screen.account_id).limit(200),
      db.from("responses").select("id", { count: "exact", head: true }).eq("account_id", screen.account_id).in("followup_status", ["open", "in_progress"]),
    ]);
    if (!acct || acct.suspended_at) return fail("not_found", undefined, undefined, requestId);
    // TV screens are a paid feature: a screen made on a paid plan pauses if the business drops to free.
    if (!planAllows(acct.plan as string, "tv")) return fail("forbidden", "This screen is paused. TV screens are part of the paid plans.", undefined, requestId);

    const list = ((rows ?? []) as unknown as Row[]).filter((r) => r.rating !== null && r.surveys && isIconSetId(r.surveys.icon_set));
    const sent = (r: Row): Sentiment => r.sentiment ?? sentimentOf(r.surveys!.icon_set as never, r.rating!);
    const pct = (rs: Row[]) => (rs.length ? Math.round((rs.filter((r) => sent(r) === "positive").length / rs.length) * 100) : null);
    const today = colomboDay(now);
    const todays = list.filter((r) => colomboDay(Date.parse(r.created_at)) === today);
    const names = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
    const byLocation = screen.location_id
      ? []
      : [...names.entries()]
          .map(([id, name]) => {
            const rs = list.filter((r) => r.location_id === id);
            return { name, total: rs.length, pct: pct(rs) };
          })
          .filter((x) => x.total > 0)
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);

    await db.from("tv_screens").update({ last_seen_at: new Date(now).toISOString() }).eq("id", screen.id).eq("account_id", screen.account_id);

    return ok({
      business: acct.name,
      screen: screen.name,
      week: { total: list.length, pct: pct(list) },
      today: { total: todays.length, pct: pct(todays), negative: todays.filter((r) => sent(r) === "negative").length },
      recent: list.slice(0, 60).map((r) => ({ sentiment: sent(r) })),
      byLocation,
      openFollowups: openFollowups ?? 0,
      // Kind words only, and only text: no names, emails or ticket numbers on an office screen.
      kudos: screen.show_comments
        ? list
            .filter((r) => sent(r) === "positive" && r.comment)
            .slice(0, 10)
            .map((r) => ({ text: r.comment!.slice(0, 280), at: r.created_at }))
        : [],
      updatedAt: new Date(now).toISOString(),
    });
  },
);
