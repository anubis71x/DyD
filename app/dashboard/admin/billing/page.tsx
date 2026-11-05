"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { BillingReport } from "@/lib/billing/report";
import { formatUsd } from "@/lib/billing/money";
import { MARKUP } from "@/lib/billing/pricing";

const thisMonth = () => new Date().toISOString().slice(0, 7);

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-destructive" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function BillingPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, error } = useQuery({
    queryKey: ["billing", month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/billing?month=${month}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't load the report");
      return (await res.json()) as BillingReport;
    },
  });

  return (
    <section aria-labelledby="billing-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="billing-h" className="font-[family-name:var(--font-display)] text-2xl font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Players pay API cost + {Math.round(MARKUP * 100)}%. Compare provider cost with the Anthropic Console for the same month.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Month
          <input
            type="month"
            value={month}
            max={thisMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-foreground"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-destructive">{(error as Error).message}</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Top-ups" value={formatUsd(data.topups.micros)} note={`${data.topups.count.toLocaleString("en-US")} payments, before Stripe fees`} />
            <Tile label="Charged to players" value={formatUsd(data.charged.micros)} note={`${data.charged.count.toLocaleString("en-US")} charges`} />
            <Tile label="Provider cost" value={formatUsd(data.providerMicros)} note="Anthropic API" />
            <Tile label="Gross margin" value={formatUsd(data.marginMicros)} tone={data.marginMicros >= 0 ? "good" : "bad"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile label="Free signup credit given" value={formatUsd(data.signupCredit.micros)} note={`${data.signupCredit.count.toLocaleString("en-US")} new players`} />
            <Tile label="Legacy coins converted" value={formatUsd(data.conversions.micros)} note={`${data.conversions.count.toLocaleString("en-US")} players`} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="px-4 pt-4 text-left font-semibold">By model</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 text-right font-medium">Charges</th>
                  <th className="px-4 py-3 text-right font-medium">Charged</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Avg per charge</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {data.byModel.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 font-sans text-muted-foreground">No charges this month.</td>
                  </tr>
                ) : (
                  data.byModel.map((m) => (
                    <tr key={m.model} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-sans">{m.model}</td>
                      <td className="px-4 py-3 text-right">{m.turns.toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right">{formatUsd(m.chargedMicros)}</td>
                      <td className="px-4 py-3 text-right">{formatUsd(m.providerMicros)}</td>
                      <td className="px-4 py-3 text-right">{formatUsd(m.chargedMicros / Math.max(1, m.turns))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {data.openHolds > 0 && (
            <p className="text-sm text-muted-foreground">
              {data.openHolds} hold(s) not released yet: turns in progress, or crashed turns that release on the player&apos;s next turn.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
