"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRef, useState } from "react";
import type { CampaignSummary } from "@/lib/save/store";
import { getModel } from "@/lib/storyteller/models";
import { getStoryteller } from "@/lib/storyteller/storytellers";
import { AccentScope } from "./ui";

export function CampaignLibrary({
  campaigns,
  onChanged,
  onImported,
}: {
  campaigns: CampaignSummary[];
  onChanged: () => void;
  onImported: (campaignId: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function remove(id: string) {
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setConfirming(null);
    if (!res.ok) setMessage("Couldn't delete that campaign. Try again.");
    onChanged();
  }

  async function importFile(file: File) {
    setMessage("Importing…");
    const res = await fetch("/api/campaigns/import", { method: "POST", body: file });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.error ?? "That file couldn't be imported.");
      return;
    }
    setMessage(null);
    onImported(body.campaignId);
  }

  return (
    <section aria-labelledby="library-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="library-heading" className="font-[family-name:var(--font-display)] text-3xl font-semibold">Your campaigns</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            id="import-save"
            type="file"
            accept=".dydsave,application/gzip,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/30">
            Import a save file
          </button>
        </div>
      </div>
      {message && <p role="status" className="text-sm text-zinc-400">{message}</p>}
      {campaigns.length === 0 ? (
        <p className="text-zinc-500">No campaigns yet. Choose a storyteller below to start your first tale.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => {
            const st = getStoryteller(c.storytellerId);
            return (
              <li key={c.campaignId}>
                <AccentScope color={st.accentColor} className="h-full">
                  <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_12%,transparent)] to-transparent bg-[#151a22] p-4">
                    <div>
                      <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{c.title}</h3>
                      <p className="text-xs text-zinc-500">
                        {c.characterName || "No character yet"} · told by {st.name} on {getModel(c.modelId).name.replace("Claude ", "")} · {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                    {c.lastRecap && <p className="line-clamp-3 text-sm text-zinc-400">{c.lastRecap}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/play/${c.campaignId}`} className="rounded-full bg-[color:var(--accent)] px-4 py-1.5 text-sm font-semibold text-[#14100b] hover:brightness-110">
                        Continue
                      </Link>
                      <a href={`/api/campaigns/${c.campaignId}/export`} className="rounded-full border border-white/15 px-3 py-1.5 text-sm hover:border-white/30">
                        Download save
                      </a>
                      {confirming === c.campaignId ? (
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-rose-300">Delete forever?</span>
                          <button type="button" onClick={() => remove(c.campaignId)} className="rounded-full bg-rose-500/80 px-3 py-1 text-white">Delete</button>
                          <button type="button" onClick={() => setConfirming(null)} className="text-zinc-400 hover:text-zinc-200">Keep</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setConfirming(c.campaignId)} className="ml-auto text-sm text-zinc-500 hover:text-rose-300">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </AccentScope>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
