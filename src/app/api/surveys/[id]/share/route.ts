import { z } from "zod";
import { secureRoute, ok, fail, dbError } from "@/lib/security/route";
import { LIMITS } from "@/lib/security/rateLimit";
import { shareQuerySchema, uuidSchema } from "@/lib/validation/schemas";
import { shareUrl, widgetUrl } from "@/lib/publicSurvey";
import { qrSvg } from "@/lib/qr";
import { escapeHtml } from "@/lib/security/html";
import { publicOriginFor } from "@/lib/surveyDomains";

const params = z.object({ id: uuidSchema }).strict();

// Everything needed to share a survey outside email: signed links, a QR code, WhatsApp/SMS text,
// the website widget code and this survey's kiosks. Links are signed here; the secret never leaves the server.
// ?locationId= makes the links, QR code and messages for one branch (the branch is signed into the link).
export const GET = secureRoute<z.infer<typeof params>, z.infer<typeof shareQuerySchema>>(
  { auth: "user", action: "survey:read", ipLimit: LIMITS.userRead, userLimit: LIMITS.userRead, params, query: shareQuerySchema },
  async ({ supabase, membership, params, query }) => {
    const { data: survey, error } = await supabase
      .from("surveys")
      .select("id, name, question, status, accounts(name)")
      .eq("id", params.id)
      .eq("account_id", membership.accountId)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!survey) return fail("not_found");
    const business = ((survey.accounts ?? null) as unknown as { name: string } | null)?.name ?? "us";

    // Only a branch of this business, and not archived.
    let location: { id: string; name: string } | null = null;
    if (query.locationId) {
      const { data: loc, error: lErr } = await supabase
        .from("locations")
        .select("id, name")
        .eq("id", query.locationId)
        .eq("account_id", membership.accountId)
        .is("archived_at", null)
        .maybeSingle();
      if (lErr) throw dbError(lErr);
      if (!loc) return fail("not_found", "That branch doesn't exist or is archived.");
      location = { id: loc.id as string, name: loc.name as string };
    }
    const locId = location?.id ?? null;

    // On the business's own web address when it has a verified one (Scale).
    const origin = await publicOriginFor(membership.accountId);
    const qrLink = shareUrl(survey.id, "qr", locId, origin);
    const waLink = shareUrl(survey.id, "whatsapp", locId, origin);
    const smsLink = shareUrl(survey.id, "sms", locId, origin);
    const message = (link: string) => `Hi! Thanks for choosing ${business}. ${survey.question} Tap here to rate us (takes a second): ${link}`;

    let kiosks: Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null; location: string | null }> = [];
    if (membership.role === "owner" || membership.role === "admin") {
      const { data: k } = await supabase
        .from("kiosks")
        .select("id, name, created_at, last_used_at, location_id, locations(name)")
        .eq("account_id", membership.accountId)
        .eq("survey_id", survey.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      kiosks = (k ?? []).map((x) => ({
        id: x.id as string,
        name: x.name as string,
        createdAt: x.created_at as string,
        lastUsedAt: (x.last_used_at as string | null) ?? null,
        location: ((x.locations ?? null) as unknown as { name: string } | null)?.name ?? null,
      }));
    }

    const wUrl = widgetUrl(survey.id, origin);
    return ok({
      active: survey.status === "active",
      location,
      link: shareUrl(survey.id, "link", locId, origin),
      qr: { link: qrLink, svg: qrSvg(qrLink, { scale: 10, title: `Rate ${survey.name}${location ? ` (${location.name})` : ""}` }) },
      whatsapp: { text: message(waLink), url: `https://wa.me/?text=${encodeURIComponent(message(waLink))}` },
      sms: { text: message(smsLink), url: `sms:?&body=${encodeURIComponent(message(smsLink))}` },
      widget: {
        url: wUrl,
        code: `<iframe src="${escapeHtml(wUrl)}" title="${escapeHtml(survey.question)}" width="100%" height="230" style="border:0;max-width:480px;" loading="lazy"></iframe>`,
      },
      kiosks,
    });
  },
);
