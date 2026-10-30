import { z } from "zod";
import { secureRoute, ok, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { followupNoteSchema, uuidSchema } from "@/lib/validation/schemas";

const params = z.object({ id: uuidSchema }).strict();

export const GET = secureRoute<z.infer<typeof params>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params },
  async ({ supabase, membership, params }) => {
    // RLS returns notes only for ratings this user may see.
    const { data, error } = await supabase
      .from("followup_notes")
      .select("id, author, body, created_at, kind, subject, sent_to, send_status")
      .eq("account_id", membership.accountId)
      .eq("response_id", params.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw dbError(error);

    // Author emails only for owners/admins (they can list members); others see "Teammate".
    const emails = new Map<string, string>();
    if (membership.role === "owner" || membership.role === "admin") {
      const { data: members } = await supabase.rpc("account_members", { p_account: membership.accountId });
      for (const m of (members ?? []) as Array<{ user_id: string; email: string }>) emails.set(m.user_id, m.email);
    }
    return ok(
      (data ?? []).map((n) => ({
        id: n.id as string,
        author: n.author ? (emails.get(n.author as string) ?? "Teammate") : "Former member",
        body: n.body as string,
        createdAt: n.created_at as string,
        // Replies emailed to the customer from the follow-up (0035) are shown differently from notes.
        kind: (n.kind as string) === "reply" ? ("reply" as const) : ("note" as const),
        subject: (n.subject as string | null) ?? null,
        sentTo: (n.sent_to as string | null) ?? null,
        sendStatus: (n.send_status as string | null) ?? null,
      })),
    );
  },
);

export const POST = secureRoute<z.infer<typeof params>, undefined, z.infer<typeof followupNoteSchema>>(
  { auth: "user", action: "response:read", ipLimit: LIMITS.userWrite, userLimit: LIMITS.userWrite, params, body: followupNoteSchema, maxBodyBytes: 12 * 1024 },
  async ({ supabase, params, body }) => {
    // The database checks the user can see this rating and isn't a viewer.
    const { data, error } = await supabase.rpc("add_followup_note", { p_response: params.id, p_body: body.body });
    if (error) throw dbError(error);
    return ok({ id: data as string }, 201);
  },
);
