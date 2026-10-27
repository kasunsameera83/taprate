"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client/api";
import { publicCommentSchema, fieldErrors } from "@/lib/validation/schemas";

type Props = { responseId: string; token: string; allowComment: boolean; existingComment: string; brandColor: string };

export function ThanksClient({ responseId, token, allowComment, existingComment, brandColor }: Props) {
  const [state, setState] = useState<"confirming" | "recorded" | "closed" | "error">("confirming");
  const [comment, setComment] = useState(existingComment);
  const [commentState, setCommentState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  // Show the saved comment (not the form) once sent, or when reopening a page that already has one.
  const [savedComment, setSavedComment] = useState(existingComment);
  const [editing, setEditing] = useState(existingComment === "");
  const sent = useRef(false);

  // Loading this page in a real browser is what confirms the rating.
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api<{ status: "recorded" | "closed" }>("/api/public/confirm", { method: "POST", body: { responseId, token } }).then((r) => {
      if (r.ok) setState(r.data.status === "closed" ? "closed" : "recorded");
      else setState("error");
    });
  }, [responseId, token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const honeypot = String(new FormData(e.currentTarget).get("website") ?? "");
    const body = { responseId, token, comment, ...(honeypot ? { website: honeypot } : {}) };
    const parsed = publicCommentSchema.safeParse(body);
    if (!parsed.success) {
      setCommentState({ kind: "error", text: Object.values(fieldErrors(parsed.error))[0] });
      return;
    }
    setCommentState({ kind: "saving" });
    const r = await api("/api/public/comment", { method: "POST", body: parsed.data });
    if (r.ok) {
      setSavedComment(parsed.data.comment);
      setEditing(false);
      setCommentState({ kind: "saved" });
    } else {
      setCommentState({ kind: "error", text: r.message });
    }
  }

  if (state === "closed") return <p className="mt-4 text-sm text-[var(--muted)]">This survey is no longer collecting responses.</p>;
  if (state === "error") return <p className="mt-4 text-sm text-[var(--danger)]">We couldn't save your rating. Please click the button in your email again.</p>;

  return (
    <div className="mt-4 text-left">
      <p className="text-center text-sm text-[var(--muted)]" role="status">
        {state === "confirming" ? "Saving your rating…" : "Your rating has been recorded."}
      </p>
      {allowComment && state === "recorded" && !editing && savedComment && (
        <div className="mt-6 rounded-lg bg-green-50 p-4" role="status">
          <p className="text-sm font-medium text-[var(--ok)]">
            {commentState.kind === "saved" ? "Thanks, we've got your comment." : "Your comment"}
          </p>
          {/* Rendered as text by React: never interpreted as HTML. */}
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--ink)]">{savedComment}</p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            onClick={() => {
              setComment(savedComment);
              setCommentState({ kind: "idle" });
              setEditing(true);
            }}
          >
            Edit comment
          </button>
        </div>
      )}
      {allowComment && state === "recorded" && editing && (
        <form onSubmit={submit} noValidate className="mt-6 space-y-3">
          <label htmlFor="comment" className="block text-sm font-medium">
            Anything you'd like to add? (optional)
          </label>
          <textarea
            id="comment"
            className="input h-28"
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {/* Honeypot for bots: hidden from people and screen readers. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--muted)]">{comment.length}/2000</span>
            <button className="btn text-white" style={{ background: brandColor }} disabled={commentState.kind === "saving"}>
              {commentState.kind === "saving" ? "Sending…" : "Send comment"}
            </button>
          </div>
          {commentState.kind === "error" && commentState.text && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {commentState.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
