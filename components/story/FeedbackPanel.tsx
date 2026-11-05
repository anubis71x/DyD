"use client";

import { ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FeedbackPayload } from "@/hooks/use-story-session";
import { FEEDBACK_TAGS } from "@/lib/storyteller/feedbackTags";

export type FeedbackTarget = FeedbackPayload["target"] & { title: string; canRecast?: boolean };

type Send = (input: FeedbackPayload) => Promise<{ ok: true; recastLabel?: string } | { ok: false; error: string }>;

/**
 * Floating feedback form. It sits over the story without blocking it: the
 * storyteller keeps talking and the player can keep typing.
 */
export function FeedbackPanel({ target, initialRating, onClose, send }: { target: FeedbackTarget; initialRating?: "up" | "down"; onClose: () => void; send: Send }) {
  const [rating, setRating] = useState<"up" | "down" | undefined>(initialRating);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [tell, setTell] = useState(true);
  const [status, setStatus] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shownTags = FEEDBACK_TAGS.filter((t) => !rating || t.tone === rating || (target.canRecast && t.id === "wrong_voice"));
  const toggleTag = (id: string) => setTags((ts) => (ts.includes(id) ? ts.filter((t) => t !== id) : [...ts, id]));
  const target_ = { type: target.type, ...(target.npcId ? { npcId: target.npcId } : {}), ...(target.speaker ? { speaker: target.speaker } : {}), ...(target.text ? { text: target.text.slice(0, 500) } : {}) };

  async function submit(e?: FormEvent, recast = false) {
    e?.preventDefault();
    setStatus({ kind: "sending" });
    const result = await send({
      target: target_,
      ...(rating ? { rating } : {}),
      tags,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
      tellStoryteller: tell,
      ...(recast ? { recast: true } : {}),
    });
    if (!result.ok) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setStatus({
      kind: "sent",
      message: result.recastLabel
        ? `New voice: ${result.recastLabel}. It's used from the next line.`
        : tell && (rating || tags.length || comment.trim())
          ? "Thanks. Your storyteller will take this into account from the next turn."
          : "Thanks for the feedback.",
    });
  }

  const empty = !rating && !tags.length && !comment.trim();

  return (
    <div role="dialog" aria-label={`Feedback: ${target.title}`} className="w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#151a22] p-4 shadow-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Feedback</p>
          <h3 className="truncate font-[family-name:var(--font-display)] text-lg font-semibold">{target.title}</h3>
          {target.text && <p className="line-clamp-2 text-xs italic text-zinc-500">“{target.text}”</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-zinc-200" aria-label="Close feedback">
          <X className="h-4 w-4" />
        </button>
      </div>

      {status.kind === "sent" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-emerald-200">{status.message}</p>
          <button type="button" onClick={onClose} className="self-end rounded-full border border-white/15 px-3 py-1 text-sm hover:border-white/30">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex gap-2" role="group" aria-label="Rating">
            {(["up", "down"] as const).map((r) => {
              const Icon = r === "up" ? ThumbsUp : ThumbsDown;
              return (
                <button
                  key={r}
                  ref={r === "up" ? firstRef : undefined}
                  type="button"
                  aria-pressed={rating === r}
                  onClick={() => setRating((cur) => (cur === r ? undefined : r))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${rating === r ? "border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]" : "border-white/10 hover:border-white/25"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {r === "up" ? "Good" : "Not great"}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick tags">
            {shownTags.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tags.includes(t.id)}
                onClick={() => toggleTag(t.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${tags.includes(t.id) ? "border-[color:var(--accent)] text-zinc-100" : "border-white/10 text-zinc-400 hover:text-zinc-200"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            {target.canRecast ? "Tell us more, or describe the voice you'd like" : "Tell us more (optional)"}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={target.canRecast ? "e.g. older and raspier" : "What would make it better?"}
              className="resize-none rounded-lg border border-white/10 bg-[#1c222d] px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[color:var(--accent)] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} className="accent-[color:var(--accent)]" />
            Let the storyteller know (from the next turn; the current one isn&apos;t interrupted)
          </label>
          {status.kind === "error" && <p role="alert" className="text-sm text-rose-300">{status.message}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {target.canRecast && (
              <button
                type="button"
                disabled={status.kind === "sending"}
                onClick={() => void submit(undefined, true)}
                className="mr-auto rounded-full border border-white/15 px-3 py-1.5 text-sm hover:border-[color:var(--accent)] disabled:opacity-50"
                title="Switch to a different voice right away"
              >
                Change voice now
              </button>
            )}
            <button
              type="submit"
              disabled={empty || status.kind === "sending"}
              className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-sm font-semibold text-[#14100b] hover:brightness-110 disabled:opacity-40"
            >
              {status.kind === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
