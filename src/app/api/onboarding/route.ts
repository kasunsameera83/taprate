import { secureRoute, ok } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";

// The first-run checklist: which setup steps this business has done. Read with the user's session (RLS).
export const GET = secureRoute(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership, user }) => {
    const acc = membership.accountId;
    const [surveys, sends, ratings, acct, members, invites, devices] = await Promise.all([
      supabase.from("surveys").select("id").eq("account_id", acc).neq("status", "archived").order("created_at", { ascending: true }).limit(1),
      supabase.from("survey_sends").select("id", { count: "exact", head: true }).eq("account_id", acc),
      supabase.from("responses").select("id", { count: "exact", head: true }).eq("account_id", acc).eq("status", "confirmed"),
      supabase.from("accounts").select("logo_path").eq("id", acc).maybeSingle(),
      supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("account_id", acc),
      supabase.from("invites").select("id", { count: "exact", head: true }).eq("account_id", acc),
      supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("account_id", acc).eq("user_id", user.id),
    ]);
    const firstSurvey = (surveys.data?.[0]?.id as string | undefined) ?? null;
    return ok({
      firstSurveyId: firstSurvey,
      steps: {
        survey: Boolean(firstSurvey),
        tried: (sends.count ?? 0) > 0 || (ratings.count ?? 0) > 0,
        rating: (ratings.count ?? 0) > 0,
        logo: Boolean(acct.data?.logo_path),
        team: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0,
        alerts: (devices.count ?? 0) > 0,
      },
    });
  },
);
