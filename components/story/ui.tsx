"use client";

import type { CSSProperties, ReactNode } from "react";
import { displayFont } from "@/lib/fonts";

export { displayFont };

/** Sets the storyteller accent for everything inside. */
export function AccentScope({ color, className, children }: { color: string; className?: string; children: ReactNode }) {
  return (
    <div className={`${displayFont.variable} ${className ?? ""}`} style={{ "--accent": color } as CSSProperties}>
      {children}
    </div>
  );
}

/** Stable, distinct color per character id. */
export function npcColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 45% 68%)`;
}

export function Portrait({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  const initial = name.replace(/^the\s+/i, "").charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-[family-name:var(--font-display)] font-bold text-[#14100b]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.5 }}
    >
      {initial}
    </span>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "bad" | "accent" }) {
  const tones = {
    muted: "border-white/10 bg-white/5 text-zinc-400",
    good: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    bad: "border-rose-400/20 bg-rose-400/10 text-rose-300",
    accent: "border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)]",
  } as const;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${tones[tone]}`}>{children}</span>;
}
