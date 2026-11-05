import Link from "next/link";

/** The Dreampool mark: a glowing pool with a highlight, plus the wordmark. */
export function Brand({ compact = false, href = "/dashboard" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Dreampool home">
      <span
        aria-hidden="true"
        className="h-7 w-7 shrink-0 rounded-full shadow-[0_0_18px_hsl(var(--primary)/0.7)]"
        style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55) 0 12%, transparent 13%), radial-gradient(circle, hsl(var(--primary)), transparent 70%)" }}
      />
      {!compact && <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-wide">Dreampool</span>}
    </Link>
  );
}
