"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type { FeedbackRecord } from "@/lib/save/store";
import { FEEDBACK_TAGS } from "@/lib/storyteller/feedbackTags";
import { getModel } from "@/lib/storyteller/models";
import { getStoryteller } from "@/lib/storyteller/storytellers";

const TARGET_LABEL: Record<FeedbackRecord["target"]["type"], string> = {
  line: "Line",
  character: "Character",
  voice: "Voice",
  storyteller: "Storyteller",
  game: "Game",
};

export default function FeedbackAdminPage() {
  const [rating, setRating] = useState<"" | "up" | "down">("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-feedback", rating],
    queryFn: async () => {
      const res = await fetch(`/api/admin/feedback${rating ? `?rating=${rating}` : ""}`);
      if (!res.ok) throw new Error("Couldn't load feedback");
      return (await res.json()) as FeedbackRecord[];
    },
  });

  const counts = data ? { up: data.filter((f) => f.rating === "up").length, down: data.filter((f) => f.rating === "down").length } : null;

  return (
    <section aria-labelledby="fb-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="fb-h" className="font-[family-name:var(--font-display)] text-2xl font-semibold">Player feedback</h2>
          <p className="text-sm text-muted-foreground">
            The latest 200 notes on lines, characters, voices and storytellers.
            {counts && !rating && ` ${counts.up} positive, ${counts.down} negative.`}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm" role="group" aria-label="Filter by rating">
          {([["", "All"], ["up", "Positive"], ["down", "Negative"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={rating === v} onClick={() => setRating(v)} className={`rounded-full px-3 py-1 ${rating === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {isLoading ? (
          <p className="p-4 text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="p-4 text-destructive">Couldn&apos;t load feedback.</p>
        ) : !data?.length ? (
          <p className="p-4 text-muted-foreground">No feedback yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">About</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Feedback</th>
                <th className="px-4 py-3 font-medium">Storyteller</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{TARGET_LABEL[f.target.type]}</span>
                    {f.target.npcId && <span className="text-muted-foreground"> · {f.target.npcId}</span>}
                    {f.target.text && <p className="mt-1 line-clamp-2 max-w-xs text-xs italic text-muted-foreground">“{f.target.text}”</p>}
                  </td>
                  <td className="px-4 py-3">{f.rating === "up" ? "👍" : f.rating === "down" ? "👎" : "–"}</td>
                  <td className="px-4 py-3">
                    {f.tags.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {f.tags.map((t) => (
                          <span key={t} className="rounded-full border border-border px-2 py-px text-xs text-muted-foreground">
                            {FEEDBACK_TAGS.find((x) => x.id === t)?.label ?? t}
                          </span>
                        ))}
                      </div>
                    )}
                    {f.comment && <p className="max-w-md">{f.comment}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {getStoryteller(f.storytellerId).name.split(" ")[0]} · {getModel(f.modelId).name.replace("Claude ", "")}
                    <br />
                    {f.tellStoryteller ? (f.deliveredAt ? "Passed on" : "Waiting for next turn") : "Not passed on"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
