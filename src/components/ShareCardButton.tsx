"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useAllows } from "@/components/PlanContext";
import { ShareDialog, type ShareCardData } from "@/components/ShareDialog";

// "Share" on a happy, consented comment: makes a picture card to post on social media.
// The server decides whether it's allowed (consent, happy rating, paid plan).
export function ShareCardButton({ responseId }: { responseId: string }) {
  const allowed = useAllows("social");
  const [open, setOpen] = useState(false);

  if (!allowed) {
    return (
      <Link href="/app/settings/billing" className="ml-2 text-[12px] font-semibold text-muted hover:text-ink" title="Social media share cards come with any paid plan">
        Share (paid plans)
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-3.5 text-[12px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(79,70,229,0.7)] transition-transform hover:-translate-y-px hover:shadow-[0_10px_18px_-8px_rgba(79,70,229,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
        </svg>
        Share
      </button>
      <ShareDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Share this review"
        subtitle="The customer agreed to share it. Only their chosen name is shown."
        fileName="customer-review.png"
        footnote="If the customer withdraws permission or you delete the comment, the link and picture stop working."
        load={() => api<ShareCardData>(`/api/responses/${encodeURIComponent(responseId)}/share-card`, { method: "POST" })}
      />
    </>
  );
}
