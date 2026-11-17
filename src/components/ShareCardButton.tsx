"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useAllows } from "@/components/PlanContext";
import { ShareDialog, type ShareCardData } from "@/components/ShareDialog";
import { confirmDialog } from "@/components/ConfirmDialog";

// "Share" on a happy, consented comment: makes a picture card to post on social media.
// The server decides whether it's allowed (consent, happy rating, paid plan).
export function ShareCardButton({ responseId, ownerConfirmed = false, autoOpen = false }: { responseId: string; ownerConfirmed?: boolean; autoOpen?: boolean }) {
  const allowed = useAllows("social");
  const [open, setOpen] = useState(autoOpen);

  if (!allowed) {
    return (
      <Link href="/app/settings/billing" className="ml-2 text-[13px] font-semibold text-muted hover:text-ink" title="Social media share cards come with any paid plan">
        Share (paid plans)
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        className="ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--color-brand-from)] to-[var(--color-brand-to)] px-3.5 text-[13px] font-bold text-white shadow-[0_6px_14px_-6px_rgba(79,70,229,0.7)] transition-transform hover:-translate-y-px hover:shadow-[0_10px_18px_-8px_rgba(79,70,229,0.8)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
        subtitle={ownerConfirmed ? "You confirmed the customer agreed. No name is shown." : "The customer agreed to share it. Only their chosen name is shown."}
        fileName="customer-review.png"
        footnote="If the customer withdraws permission or you delete the comment, the link and picture stop working."
        load={() => api<ShareCardData>(`/api/responses/${encodeURIComponent(responseId)}/share-card`, { method: "POST" })}
      />
    </>
  );
}

/**
 * A happy comment the customer didn't tick "share" for: the owner/admin can confirm the customer agreed some
 * other way (for example on WhatsApp). The server records who confirmed it; the picture never shows a name.
 */
export function OwnerShareButton({ responseId, onConfirmed }: { responseId: string; onConfirmed: () => void }) {
  const allowed = useAllows("social");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!allowed) {
    return (
      <Link href="/app/settings/billing" className="ml-2 text-[13px] font-semibold text-muted hover:text-ink" title="Social media share cards come with any paid plan">
        Share (paid plans)
      </Link>
    );
  }
  return (
    <span className="ml-2 inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand/40 px-3.5 text-[13px] font-semibold text-brand hover:bg-brand-soft"
        onClick={async () => {
          const ok = await confirmDialog({
            title: "Did the customer agree to share this?",
            body: "They didn't tick “share my comment” on the thank-you page. Only continue if they told you it's fine to post it (for example on WhatsApp or by phone). The picture won't show their name, and we'll note that you confirmed it.",
            confirmLabel: "Yes, they agreed",
            cancelLabel: "Not yet",
          });
          if (!ok) return;
          setBusy(true);
          setErr("");
          const r = await api(`/api/responses/${encodeURIComponent(responseId)}/share-permission`, { method: "POST", body: { allowed: true } });
          setBusy(false);
          if (r.ok) onConfirmed();
          else setErr(r.message);
        }}
      >
        Share…
      </button>
      {err && <span className="mt-1 text-[13px] text-neg-text">{err}</span>}
    </span>
  );
}
