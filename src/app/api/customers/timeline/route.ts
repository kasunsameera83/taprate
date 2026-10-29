import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { emailSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

// POST so the email address never sits in a URL or server log.
const bodySchema = z.object({ email: emailSchema }).strict();

type Rated = {
  id: string;
  rating: number | null;
  sentiment: string | null;
  comment: string | null;
  channel: string | null;
  followup_status: string | null;
  resolved_at: string | null;
  recovery_of: string | null;
  created_at: string;
  surveys: { name: string } | null;
  locations: { name: string } | null;
};

// Everything one customer has told this business, newest first. Read with the user's own session,
// so the database decides what this person may see. Emails sent are shown only to roles that can see sends.
export const POST = secureRoute<undefined, undefined, z.infer<typeof bodySchema>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, body: bodySchema, maxBodyBytes: 512 },
  async ({ supabase, membership, body }) => {
    const { data, error } = await supabase
      .from("responses")
      .select("id, rating, sentiment, comment, channel, followup_status, resolved_at, recovery_of, created_at, surveys(name), locations(name)")
      .eq("account_id", membership.accountId)
      .eq("status", "confirmed")
      // Lower-case copy kept by the database (0028): ignores capitals and uses an index.
      .eq("respondent_email_lc", body.email)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw dbError(error);
    const rated = (data ?? []) as unknown as Rated[];

    // Agents can't read sends (RLS returns nothing for them), so this is simply empty for them.
    const { data: sent } = await supabase
      .from("send_recipients")
      .select("id, status, sent_at, survey_sends(name)")
      .eq("account_id", membership.accountId)
      .eq("email", body.email)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(50);

    const ratings = rated.map((r) => ({
      id: r.id,
      rating: r.rating,
      sentiment: r.sentiment,
      comment: r.comment,
      channel: r.channel,
      survey: r.surveys?.name ?? "",
      location: r.locations?.name ?? null,
      followup: r.followup_status,
      resolvedAt: r.resolved_at,
      wonBack: Boolean(r.recovery_of),
      at: r.created_at,
    }));
    const positive = ratings.filter((r) => r.sentiment === "positive").length;
    return ok({
      email: body.email,
      summary: { total: ratings.length, positive, negative: ratings.filter((r) => r.sentiment === "negative").length, first: ratings.at(-1)?.at ?? null, last: ratings[0]?.at ?? null },
      ratings,
      emails: ((sent ?? []) as unknown as Array<{ id: string; status: string; sent_at: string; survey_sends: { name: string } | null }>).map((s) => ({ id: s.id, name: s.survey_sends?.name ?? "", status: s.status, at: s.sent_at })),
    });
  },
);
