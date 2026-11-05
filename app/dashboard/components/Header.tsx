"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { AddFundsButton } from "@/components/billing/AddFunds";
import { DashboardIntroModal } from "@/components/intro";
import { formatUsd } from "@/lib/billing/money";

export function Header() {
  const queryClient = useQueryClient();
  const [introOpen, setIntroOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["info"],
    queryFn: async () => (await axios.get("/api/user")).data as { isNewUser?: boolean; balanceMicros?: number },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data?.isNewUser) setIntroOpen(true);
  }, [data?.isNewUser]);

  // Top-ups are credited by Stripe's webhook a moment after payment: re-check a few times.
  const refreshSoon = () => [2000, 5000, 10000].forEach((ms) => setTimeout(() => queryClient.invalidateQueries({ queryKey: ["info"] }), ms));

  return (
    <header className="flex items-center justify-end gap-3 px-4 py-3 sm:px-6">
      <DashboardIntroModal open={introOpen} onOpenChange={() => setIntroOpen((o) => !o)} />
      <div className="flex items-center gap-3 rounded-full border border-border bg-card/80 py-1 pl-4 pr-1 backdrop-blur">
        <span className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</span>
          <span className="font-mono text-sm tabular-nums">{data ? formatUsd(data.balanceMicros ?? 0) : "…"}</span>
        </span>
        <AddFundsButton onFunded={refreshSoon} />
      </div>
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
