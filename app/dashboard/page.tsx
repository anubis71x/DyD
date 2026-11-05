"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccentScope } from "@/components/story/ui";
import type { CampaignSummary } from "@/lib/save/store";
import { getModel } from "@/lib/storyteller/models";
import { getStoryteller } from "@/lib/storyteller/storytellers";

export default function HomePage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/campaigns", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(d.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, []);

  const latest = campaigns?.[0];
  const st = latest ? getStoryteller(latest.storytellerId) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 pt-6 sm:pt-12">
      <section className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-balance font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.05] sm:text-6xl">
          {latest ? "Welcome back to the table." : "Your story starts here."}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Choose a storyteller and tell them who you are. They narrate, voice every character you meet and run the rules,
          while your character sheet, quests and journal keep themselves up to date.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/dashboard/narrator#new"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Start a new adventure
          </Link>
          {campaigns && campaigns.length > 1 && (
            <Link href="/dashboard/narrator" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 hover:border-muted-foreground">
              All campaigns ({campaigns.length})
            </Link>
          )}
        </div>
      </section>

      {latest && st && (
        <AccentScope color={st.accentColor}>
          <Link
            href={`/dashboard/play/${latest.campaignId}`}
            className="group flex flex-col gap-4 rounded-2xl border border-border p-6 transition hover:border-[color:var(--accent)] sm:flex-row sm:items-center sm:justify-between"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), hsl(var(--card))` }}
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Continue</span>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{latest.title}</h2>
              <p className="text-sm text-muted-foreground">
                {latest.characterName || "No character yet"} · told by {st.name} on {getModel(latest.modelId).name.replace("Claude ", "")} ·{" "}
                {formatDistanceToNow(new Date(latest.updatedAt), { addSuffix: true })}
              </p>
              {latest.lastRecap && <p className="mt-1 line-clamp-2 max-w-[60ch] text-muted-foreground">{latest.lastRecap}</p>}
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[color:var(--accent)] px-5 py-2.5 font-semibold text-[#14100b] sm:self-center">
              Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </AccentScope>
      )}

      <section aria-labelledby="how" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how" className="sr-only">How it works</h2>
        {[
          ["Pick a storyteller", "Grim, whimsical, cozy or tactical. Each has a voice and a style, and you can choose the model they run on."],
          ["Play your way", "Type what you do, tap a suggested action, and roll dice when it matters. Rolls happen on our side, so they're always fair."],
          ["Pick up anytime", "Everything saves as you play. Each session ends with a journal entry, and the next one opens where you left off."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-border bg-card/70 p-5">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
