"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { publicCommentSchema, fieldErrors } from "@/lib/validation/schemas";
import { readableTextOn } from "@/lib/surveys/color";
import { IconAlert, IconCheck } from "@/components/icons";
import { Busy } from "@/components/FaceLoader";

type Props = {
  responseId: string;
  token: string;
  allowComment: boolean;
  existingComment: string;
  brandColor: string;
  driverOptions: string[];
  driverPrompt: string;
  existingDrivers: string[];
  review: { label: string; url: string } | null;
  /** Asking a happy customer if their comment may be shown on the business's website. */
  share: { label: string; consent: boolean; name: string } | null;
  /** Customer-facing words in the survey's language. */
  text: Record<"shareName" | "shareHint" | "notCollecting" | "saveFailed" | "savingRating" | "ratingSaved" | "tapAny" | "saving" | "saved" | "couldntSave" | "commentThanks" | "yourComment" | "editComment" | "tellMore" | "optional" | "commentPlaceholder" | "sendComment" | "sending", string>;
};

export function ThanksClient({ responseId, token, allowComment, existingComment, brandColor, driverOptions, driverPrompt, existingDrivers, review, share, text: t }: Props) {
  const [consent, setConsent] = useState(share?.consent ?? false);
  const [displayName, setDisplayName] = useState(share?.name ?? "");
  const [state, setState] = useState<"confirming" | "recorded" | "closed" | "error">("confirming");
  const [comment, setComment] = useState(existingComment);
  const [commentState, setCommentState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  // Show the saved comment (not the form) once sent, or when reopening a page that already has one.
  const [savedComment, setSavedComment] = useState(existingComment);
  const [editing, setEditing] = useState(existingComment === "");
  const [drivers, setDrivers] = useState<string[]>(existingDrivers.filter((d) => driverOptions.includes(d)));
  const [driverState, setDriverState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const sent = useRef(false);
  const buttonText = readableTextOn(brandColor);

  // Loading this page in a real browser is what confirms the rating (scanners never get this far).
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api<{ status: "recorded" | "closed" }>("/api/public/confirm", { method: "POST", body: { responseId, token } }).then((r) => {
      if (r.ok) setState(r.data.status === "closed" ? "closed" : "recorded");
      else setState("error");
    });
  }, [responseId, token]);

  // Reasons save as soon as they're tapped: one tap, no extra button.
  async function toggleDriver(label: string) {
    const next = drivers.includes(label) ? drivers.filter((d) => d !== label) : [...drivers, label];
    setDrivers(next);
    setDriverState("saving");
    const parsed = publicCommentSchema.safeParse({ responseId, token, drivers: next });
    if (!parsed.success) return setDriverState("error");
    const r = await api("/api/public/comment", { method: "POST", body: parsed.data });
    setDriverState(r.ok ? "saved" : "error");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const honeypot = String(new FormData(e.currentTarget).get("website") ?? "");
    const body = {
      responseId,
      token,
      comment,
      ...(share ? { shareConsent: consent, displayName: consent && displayName.trim() ? displayName : null } : {}),
      ...(honeypot ? { website: honeypot } : {}),
    };
    const parsed = publicCommentSchema.safeParse(body);
    if (!parsed.success) {
      setCommentState({ kind: "error", text: Object.values(fieldErrors(parsed.error))[0] });
      return;
    }
    setCommentState({ kind: "saving" });
    const r = await api("/api/public/comment", { method: "POST", body: parsed.data });
    if (r.ok) {
      setSavedComment(parsed.data.comment ?? "");
      setEditing(false);
      setCommentState({ kind: "saved" });
    } else {
      setCommentState({ kind: "error", text: r.message });
    }
  }

  if (state === "closed") {
    return <p className="mt-6 rounded-[10px] bg-[#f1f5f9] px-4 py-3 text-sm text-muted">{t.notCollecting}</p>;
  }
  if (state === "error") {
    return (
      <p role="alert" className="mt-6 flex items-start gap-2 rounded-[10px] bg-neg-soft px-4 py-3 text-left text-sm text-neg-text">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
        {t.saveFailed}
      </p>
    );
  }

  return (
    <div className="mt-6 text-left">
      <p className="flex items-center justify-center gap-1.5 text-sm text-muted" role="status">
        {state === "confirming" ? (
          t.savingRating
        ) : (
          <>
            <IconCheck className="h-4 w-4 text-pos-text" />
            {t.ratingSaved}
          </>
        )}
      </p>

      {state === "recorded" && review && (
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="btn mt-6 w-full"
          style={{ background: brandColor, color: buttonText }}
        >
          {review.label}
        </a>
      )}

      {state === "recorded" && driverOptions.length > 0 && (
        <fieldset className="mt-6">
          <legend className="text-[15px] font-semibold">
            {driverPrompt} <span className="font-normal text-muted">{t.tapAny}</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {driverOptions.map((d) => {
              const on = drivers.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDriver(d)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${on ? "border-transparent" : "border-control bg-white text-ink hover:border-ink"}`}
                  style={on ? { background: brandColor, color: buttonText } : undefined}
                >
                  {on && <IconCheck className="-ml-1 mr-1 inline h-4 w-4" />}
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-2 h-4 text-xs text-muted" aria-live="polite">
            {driverState === "saving" ? t.saving : driverState === "saved" ? t.saved : driverState === "error" ? t.couldntSave : ""}
          </p>
        </fieldset>
      )}

      {allowComment && state === "recorded" && !editing && savedComment && (
        <div className="mt-6 rounded-[12px] border border-[#c6e7d3] bg-pos-soft p-4" role="status">
          <p className="text-sm font-semibold text-pos-text">{commentState.kind === "saved" ? t.commentThanks : t.yourComment}</p>
          {/* Rendered as text by React: never interpreted as HTML. */}
          <p className="mt-2 whitespace-pre-wrap break-words text-[15px] text-ink">{savedComment}</p>
          <button
            type="button"
            className="link mt-3 min-h-9 text-sm"
            onClick={() => {
              setComment(savedComment);
              setCommentState({ kind: "idle" });
              setEditing(true);
            }}
          >
            {t.editComment}
          </button>
        </div>
      )}

      {allowComment && state === "recorded" && editing && (
        <form onSubmit={submit} noValidate className="mt-6 space-y-3">
          <label htmlFor="comment" className="block text-[15px] font-semibold">
            {t.tellMore} <span className="font-normal text-muted">{t.optional}</span>
          </label>
          <textarea
            id="comment"
            className="input"
            rows={4}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-describedby="comment-count"
            placeholder={t.commentPlaceholder}
          />
          {share && (
            <div className="space-y-2 rounded-[10px] border border-line bg-canvas p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: brandColor }} />
                <span>
                  {share.label}
                  <span className="block text-[12px] text-muted">{t.shareHint}</span>
                </span>
              </label>
              {consent && (
                <div>
                  <label htmlFor="displayName" className="mb-1 block text-[13px] font-semibold">
                    {t.shareName}
                  </label>
                  <input id="displayName" className="input" maxLength={40} autoComplete="given-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
              )}
            </div>
          )}
          {/* Honeypot for bots: hidden from people and screen readers. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
          <div className="flex items-center justify-between gap-3">
            <span id="comment-count" className="tabular text-xs text-muted">
              {comment.length}/2000
            </span>
            <button
              className="btn min-w-36"
              style={{ background: brandColor, color: buttonText }}
              disabled={commentState.kind === "saving" || comment.trim().length === 0}
            >
              {commentState.kind === "saving" ? <Busy>{t.sending}</Busy> : t.sendComment}
            </button>
          </div>
          {commentState.kind === "error" && commentState.text && (
            <p role="alert" className="text-sm text-neg-text">
              {commentState.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
