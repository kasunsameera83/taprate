import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { buildWallToken } from "@/lib/security/signing";
import { escapeHtml } from "@/lib/security/html";
import { env } from "@/lib/env";

// The business's testimonial wall: its link, the code to embed it, and how many comments are shown.
export const GET = secureRoute(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead },
  async ({ supabase, membership }) => {
    const { count, error } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("account_id", membership.accountId)
      .not("featured_at", "is", null);
    if (error) throw dbError(error);
    const e = env();
    const url = `${e.appOrigin}/wall/${buildWallToken(e.LINK_SIGNING_SECRET, membership.accountId)}`;
    return ok({
      featured: count ?? 0,
      url,
      code: `<iframe src="${escapeHtml(url)}" title="What our customers say" width="100%" height="520" style="border:0;" loading="lazy"></iframe>`,
    });
  },
);
