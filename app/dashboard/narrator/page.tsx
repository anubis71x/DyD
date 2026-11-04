"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CampaignLibrary } from "@/components/story/CampaignLibrary";
import { StorytellerPicker } from "@/components/story/StorytellerPicker";
import { displayFont } from "@/components/story/ui";
import type { CampaignSummary } from "@/lib/save/store";

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load your campaigns. Reload the page to try again.");
      return;
    }
    setCampaigns((await res.json()).campaigns);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function start(storytellerId: string) {
    setStarting(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storytellerId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't start a campaign.");
      setStarting(false);
      return;
    }
    router.push(`/dashboard/play/${body.campaignId}`);
  }

  return (
    <div className={`${displayFont.variable} mx-auto flex max-w-7xl flex-col gap-12 px-5 pb-16`}>
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100/90" role="note">
        Voice play is paused for maintenance while we move to our new storyteller. You can play every campaign by text in the meantime.
      </div>
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {campaigns === null ? (
        <p className="text-zinc-500">Loading your campaigns…</p>
      ) : (
        <CampaignLibrary campaigns={campaigns} onChanged={refresh} onImported={(id) => router.push(`/dashboard/play/${id}`)} />
      )}
      <StorytellerPicker onStart={start} busy={starting} />
    </div>
  );
}
