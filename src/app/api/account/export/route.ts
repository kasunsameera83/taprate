import { secureRoute, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { audit } from "@/lib/audit";

const MAX_RESPONSES = 50_000;

// Full data export for the business (data portability). Owners only, read through RLS as the user.
export const GET = secureRoute(
  { auth: "user", action: "account:export", ipLimit: LIMITS.userExport, userLimit: LIMITS.userExport },
  async ({ supabase, membership, user, ipHash }) => {
    const id = membership.accountId;
    const [account, surveys, responses, members, invites] = await Promise.all([
      supabase.from("accounts").select("id, name, plan, credit_balance, created_at").eq("id", id).maybeSingle(),
      supabase
        .from("surveys")
        .select("id, name, question, icon_set, brand_color, thank_you_message, allow_comment, website_url, alert_threshold, alert_emails, status, created_at, updated_at")
        .eq("account_id", id),
      supabase
        .from("responses")
        .select("id, survey_id, rating, sentiment, status, comment, respondent_email, agent, ticket_ref, metadata_verified, created_at, confirmed_at")
        .eq("account_id", id)
        .order("created_at", { ascending: false })
        .limit(MAX_RESPONSES),
      supabase.rpc("account_members", { p_account: id }),
      supabase.from("invites").select("email, role, agent_name, status, created_at, expires_at").eq("account_id", id),
    ]);
    for (const r of [account, surveys, responses, members, invites]) if (r.error) throw dbError(r.error);

    const body = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        account: account.data,
        surveys: surveys.data,
        responses: responses.data,
        responsesTruncated: (responses.data?.length ?? 0) >= MAX_RESPONSES,
        members: members.data,
        invites: invites.data,
      },
      null,
      2,
    );
    await audit({ accountId: id, userId: user.id, action: "account.export", ipHash });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="taprate-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
