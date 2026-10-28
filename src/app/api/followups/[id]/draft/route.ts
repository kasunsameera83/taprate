import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { hitRateLimit, LIMITS } from "@/lib/security/rateLimit";
import { uuidSchema } from "@/lib/validation/schemas";
import { env } from "@/lib/env";
import { askClaude } from "@/lib/insights/ai";
import { buildReplyPrompt, parseReplyAnswer, replySystemPrompt } from "@/lib/insights/reply";
import { isIconSetId } from "@/lib/surveys/iconSets";
import { labelsFor } from "@/lib/surveys/customIcons";
import { isLang, standardLabel } from "@/lib/i18n/public";

const params = z.object({ id: uuidSchema }).strict();
export const maxDuration = 60;

// AI draft of a reply to an unhappy customer. Anyone who can see the follow-up (agents only their own,
// via the database's row rules). Only when an owner has switched AI on, and rate limited (cost).
// Nothing is sent: the person copies or edits the draft and sends it themselves.
export const POST = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.aiPerUser, params },
  async ({ supabase, membership, user, params, requestId }) => {
    const e = env();
    if (!e.ANTHROPIC_API_KEY) return fail("unavailable", "AI isn't set up on this server yet.", undefined, requestId);
    const [{ data: acct }, { data: r, error }] = await Promise.all([
      supabase.from("accounts").select("name, ai_insights_enabled").eq("id", membership.accountId).maybeSingle(),
      supabase
        .from("responses")
        .select("id, rating, comment, drivers, agent, followup_status, surveys(question, icon_set, option_labels, language)")
        .eq("id", params.id)
        .eq("account_id", membership.accountId)
        .maybeSingle(),
    ]);
    if (error) throw dbError(error);
    if (!acct?.ai_insights_enabled) return fail("forbidden", "An owner needs to turn on AI in Insights first.", undefined, requestId);
    const s = (r?.surveys ?? null) as unknown as { question: string; icon_set: string; option_labels: unknown; language: string } | null;
    if (!r || !s || !r.followup_status || r.rating === null || !isIconSetId(s.icon_set)) return fail("not_found", undefined, undefined, requestId);
    if (!(await hitRateLimit(LIMITS.aiDraftPerAccount, membership.accountId))) {
      return fail("rate_limited", "You've drafted a lot of replies today. Try again tomorrow.", undefined, requestId);
    }

    const lang = isLang(s.language) ? s.language : "en";
    const custom = labelsFor(s.icon_set, s.option_labels);
    const { data: me } = await supabase.from("memberships").select("agent_name").eq("account_id", membership.accountId).eq("user_id", user.id).maybeSingle();
    const signOff = `${me?.agent_name || r.agent || "The team"}, ${acct.name}`;
    const answer = await askClaude({
      apiKey: e.ANTHROPIC_API_KEY,
      model: e.ANTHROPIC_MODEL,
      system: replySystemPrompt(lang),
      prompt: buildReplyPrompt({
        businessName: acct.name,
        question: s.question,
        ratingLabel: custom[String(r.rating)] ?? standardLabel(s.icon_set, r.rating, "en"),
        reasons: (r.drivers as string[] | null) ?? [],
        comment: r.comment,
        signOff,
      }),
      maxTokens: 700,
    });
    if (!answer.ok) return fail("unavailable", answer.reason === "busy" ? "The AI is busy. Try again in a minute." : "Couldn't make a draft right now. Try again.", undefined, requestId);
    const draft = parseReplyAnswer(answer.text);
    if (!draft) return fail("unavailable", "Couldn't make a usable draft. Try again.", undefined, requestId);
    return ok(draft);
  },
);
