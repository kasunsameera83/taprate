import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/server";
import { parseKioskToken } from "@/lib/security/signing";
import { loadPublicSurvey } from "@/lib/publicSurvey";
import { ICON_SETS } from "@/lib/surveys/iconSets";
import { KioskClient } from "./KioskClient";

export const metadata: Metadata = { title: "Rate us", robots: { index: false, follow: false } };

// Full-screen kiosk for a tablet at a counter or reception. The link holds a secret; only its hash
// is stored, and the business can revoke it at any time.
export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = parseKioskToken(token);
  if (!parsed) notFound();

  const { data: kiosk } = await adminClient().from("kiosks").select("id, survey_id, token_hash, revoked_at").eq("id", parsed.kioskId).maybeSingle();
  const hash = createHash("sha256").update(parsed.secret).digest("hex");
  if (!kiosk || kiosk.revoked_at || !timingSafeEqual(Buffer.from(hash), Buffer.from(kiosk.token_hash))) notFound();

  const survey = await loadPublicSurvey(kiosk.survey_id);
  if (!survey) notFound();

  const { data: s } = await adminClient().from("surveys").select("thank_you_message, drivers_positive, drivers_negative").eq("id", survey.id).maybeSingle();

  return (
    <KioskClient
      token={token}
      question={survey.question}
      iconSet={survey.iconSet}
      options={ICON_SETS[survey.iconSet].options}
      brandColor={survey.brandColor}
      logo={survey.logo}
      business={survey.business}
      active={survey.active}
      thankYou={s?.thank_you_message ?? "Thank you!"}
      driversPositive={s?.drivers_positive ?? []}
      driversNegative={s?.drivers_negative ?? []}
    />
  );
}
