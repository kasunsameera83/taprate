import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { adminClient } from "@/lib/supabase/server";
import { isIconSetId } from "@/lib/surveys/iconSets";
import { standardLabel } from "@/lib/i18n/public";
import type { NotificationItem } from "@/lib/client/types";


type Row = { id: string; rating: number | null; comment: string | null; sentiment: string | null; confirmed_at: string; surveys: { name: string; icon_set: string } | null };

const snip = (s: string | null, n = 90) => (s ? (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s) : null);

// What's new for the signed-in person in the active business: new ratings since they last looked, plus
// things that need attention (open follow-ups assigned to them, low responses, payment problems, new team
// members). Ratings are read with the user's own client, so agents only see what they're allowed to.
export const GET = secureRoute(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, user, membership }) => {
    const acc = membership.accountId;
    const { data: me, error: meErr } = await supabase.from("memberships").select("notifications_seen_at").eq("account_id", acc).eq("user_id", user.id).maybeSingle();
    if (meErr) throw dbError(meErr);
    const since = (me?.notifications_seen_at as string | undefined) ?? new Date().toISOString();
    const manager = membership.role === "owner" || membership.role === "admin";

    const [fresh, latest, assigned, acct, members, sub] = await Promise.all([
      supabase
        .from("responses")
        .select("id, rating, comment, sentiment, confirmed_at, surveys(name, icon_set)", { count: "exact" })
        .eq("account_id", acc)
        .eq("status", "confirmed")
        .gt("confirmed_at", since)
        .order("confirmed_at", { ascending: false })
        .limit(10),
      supabase.from("responses").select("id, confirmed_at").eq("account_id", acc).eq("status", "confirmed").order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("responses").select("id", { count: "exact", head: true }).eq("account_id", acc).eq("assignee", user.id).in("followup_status", ["open", "in_progress"]),
      manager ? supabase.from("accounts").select("credit_balance").eq("id", acc).maybeSingle() : Promise.resolve({ data: null }),
      manager
        ? supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("account_id", acc).neq("user_id", user.id).gt("created_at", since)
        : Promise.resolve({ count: 0 }),
      membership.role === "owner"
        ? adminClient().from("subscriptions").select("status, cancel_at_period_end, current_period_end").eq("account_id", acc).in("status", ["active", "past_due"]).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (fresh.error) throw dbError(fresh.error);

    const items: NotificationItem[] = [];
    for (const r of (fresh.data ?? []) as unknown as Row[]) {
      const set = r.surveys && isIconSetId(r.surveys.icon_set) ? r.surveys.icon_set : null;
      const label = set && r.rating !== null ? standardLabel(set, r.rating) : "New rating";
      const unhappy = r.sentiment === "negative";
      items.push({
        id: `r:${r.id}`,
        kind: unhappy ? "unhappy" : "rating",
        title: unhappy ? `Unhappy customer: ${label}` : `New rating: ${label}`,
        body: snip(r.comment) ?? (r.surveys?.name ? `on “${r.surveys.name}”` : null),
        href: unhappy ? "/app/follow-ups" : "/app/responses",
        at: r.confirmed_at,
        unread: true,
      });
    }
    const newRatings = fresh.count ?? items.length;
    if (newRatings > items.length) {
      items.push({ id: "r:more", kind: "rating", title: `${newRatings - items.length} more new ratings`, body: null, href: "/app/responses", at: null, unread: true });
    }

    const newMembers = "count" in members ? (members.count ?? 0) : 0;
    if (newMembers > 0) items.push({ id: "team", kind: "team", title: newMembers === 1 ? "Someone joined your team" : `${newMembers} people joined your team`, body: null, href: "/app/settings/team", at: null, unread: true });

    const open = assigned.count ?? 0;
    if (open > 0) items.push({ id: "followups", kind: "followups", title: open === 1 ? "1 follow-up is waiting for you" : `${open} follow-ups are waiting for you`, body: null, href: "/app/follow-ups", at: null, unread: false });

    const balance = (acct.data as { credit_balance?: number } | null)?.credit_balance;
    if (typeof balance === "number" && balance <= 20) {
      items.push({ id: "credits", kind: "credits", title: balance === 0 ? "You're out of responses" : `Only ${balance} responses left`, body: "New ratings aren't saved when you run out.", href: "/app/settings/billing", at: null, unread: false });
    }

    const s = sub.data as { status: string; cancel_at_period_end: boolean; current_period_end: string | null } | null;
    if (s?.status === "past_due") items.push({ id: "billing", kind: "billing", title: "Your last payment didn't go through", body: "Update your payment details to keep your plan.", href: "/app/settings/billing", at: null, unread: false });
    else if (s?.cancel_at_period_end && s.current_period_end && Date.parse(s.current_period_end) - Date.now() < 7 * 86400_000) {
      items.push({ id: "billing", kind: "billing", title: "Your plan ends soon", body: `It ends on ${new Date(s.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`, href: "/app/settings/billing", at: null, unread: false });
    }

    return ok({
      unread: newRatings + newMembers,
      latestId: (latest.data as { id: string } | null)?.id ?? null,
      items,
    });
  },
);
