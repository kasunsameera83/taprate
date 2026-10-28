import "server-only";
import { adminClient } from "@/lib/supabase/server";
import { processQueue } from "@/lib/sending/server";
import { isLang, pt } from "@/lib/i18n/public";

/**
 * After a follow-up is resolved: queue and send the "did we fix it?" email (the database decides whether
 * it's appropriate). Runs after the response to the person who resolved it, so it never slows them down.
 */
export async function sendRecoveryFor(responseId: string, accountId: string): Promise<void> {
  const db = adminClient();
  const { data } = await db.from("responses").select("id, surveys(language)").eq("id", responseId).eq("account_id", accountId).maybeSingle();
  if (!data) return;
  const lang = isLang((data.surveys as unknown as { language?: string } | null)?.language) ? ((data.surveys as unknown as { language: string }).language as "en" | "si" | "ta") : "en";
  const { data: sendId, error } = await db.rpc("queue_recovery", { p_response: responseId, p_subject: pt(lang, "recoverySubject"), p_intro: pt(lang, "recoveryIntro") });
  if (error || !sendId) return;
  await processQueue(db, { sendId: sendId as string, budgetMs: 10_000 });
}
