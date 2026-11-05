import { ArrowRight, BookOpen, Dices, Languages, MessageSquareText, Mic, Save } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Brand } from "@/components/brand";
import { formatUsd, MIN_TOPUP_CENTS, SIGNUP_CREDIT_MICROS } from "@/lib/billing/money";
import { MARKUP, typicalTurnMicros } from "@/lib/billing/pricing";
import { MODELS } from "@/lib/storyteller/models";
import { STORYTELLERS } from "@/lib/storyteller/storytellers";

/* Clicking anything marked data-conversion="start-adventuring" reports a Google Ads conversion (see GoogleTag). */
function StartButton({ children = "Start adventuring", className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <Link
      href="/dashboard"
      data-conversion="start-adventuring"
      className={`inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      {children} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-balance font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight sm:text-5xl">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg text-muted-foreground">{children}</p>}
    </div>
  );
}

/** A static replica of the play screen, so visitors see what playing looks like. */
function TablePreview() {
  const line = (who: string, color: string, voice: string | null, text: string, kind: "narration" | "npc") => (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-[family-name:var(--font-display)] text-sm font-bold text-[#14100b]" style={{ background: color }} aria-hidden="true">
        {who[0]}
      </span>
      <div className="min-w-0">
        <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {who}
          {voice && <span className="rounded-full border border-border px-1.5 py-px">{voice}</span>}
        </div>
        {kind === "narration" ? (
          <p className="font-[family-name:var(--font-display)] text-lg leading-snug">{text}</p>
        ) : (
          <p className="rounded-lg rounded-tl-sm border border-border bg-secondary px-3 py-1.5 text-sm" style={{ borderLeft: `3px solid ${color}` }}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
  return (
    <div className="relative rounded-2xl border border-border bg-card/90 p-5 shadow-[0_30px_80px_-30px_rgba(211,139,76,0.35)] backdrop-blur" aria-label="Example of a game in progress" role="img">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold">The Salt Lantern</p>
          <p className="text-[11px] text-muted-foreground">Session 3 · told by Eldrath Shadowweaver</p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground">✓ Saved</span>
      </div>
      <div className="flex flex-col gap-4">
        {line("Eldrath Shadowweaver", "#d38b4c", null, "Rain needles the window. A leather ledger sits at Venn's elbow, its corner stamped with a wave.", "narration")}
        {line("Harbormaster Venn", "hsl(38 45% 68%)", "Gravel Baritone", "Port's closed after dark, girl. State your business.", "npc")}
        <div className="ml-11 flex flex-wrap gap-2">
          {["Slip the ledger off his desk", "Show him the forged writ"].map((c) => (
            <span key={c} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">
              {c}
            </span>
          ))}
        </div>
        <div className="ml-11 flex items-center gap-3 rounded-xl border border-primary/50 bg-primary/10 px-3 py-2">
          <Dices className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-sm">
            Sleight of Hand · <span className="font-mono">d20+5 → 22</span> <span className="text-emerald-300">beats DC 14</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: MessageSquareText, title: "A storyteller who listens", body: "Say or type anything. Your storyteller adapts the story, voices every character and keeps the rules honest without slowing you down." },
  { icon: Save, title: "It remembers everything", body: "Your character sheet, inventory, quests and the people you've met update as you play. Each session ends with a journal entry, and you can download your save file anytime." },
  { icon: Dices, title: "Fair dice", body: "Rolls happen on our servers, not in your browser or the AI's imagination, and the storyteller narrates from the real result." },
  { icon: BookOpen, title: "Any setting", body: "Dark fantasy, fairy tale, cozy tavern or tactical war story. Rules are compatible with fifth edition, from the open SRD." },
  { icon: Languages, title: "In your language", body: "Play in English, Español, 日本語 and many more. Just start talking in the language you want." },
  { icon: Mic, title: "Voice play returns soon", body: "Talk to your storyteller and hear every character in their own voice. Voice is paused while we move to our new storyteller; text play works today." },
];

export default function LandingPage() {
  const haiku = MODELS.find((m) => m.id === "haiku")!;
  const sonnet = MODELS.find((m) => m.id === "sonnet")!;
  const opus = MODELS.find((m) => m.id === "opus")!;
  const priced = [haiku, sonnet, opus].map((m) => ({ m, typical: typicalTurnMicros(m.apiModel) }));
  const freeTurns = Math.floor(SIGNUP_CREDIT_MICROS / priced[0].typical / 100) * 100;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Brand href="/" />
          <div className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#storytellers" className="hover:text-foreground">Storytellers</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <Link href="/dashboard" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Sign in</Link>
            <Link href="/dashboard" data-conversion="start-adventuring" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110">
              Start adventuring
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div className="flex flex-col gap-6">
            <h1 className="text-balance font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              Solo adventures, told by a storyteller who remembers.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Dreampool is an AI game master for one player. Pick a storyteller, create your character by talking, and play a
              tabletop-style story that keeps your character sheet, quests and journal as you go.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <StartButton />
              <p className="text-sm text-muted-foreground">
                {formatUsd(SIGNUP_CREDIT_MICROS)} free to start · no subscription
              </p>
            </div>
          </div>
          <TablePreview />
        </section>

        <section aria-labelledby="how-title" id="how" className="scroll-mt-20 border-t border-border/60 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading id="how-title" eyebrow="How it works" title="Sit down, say who you are, and play." />
            <ol className="grid gap-4 md:grid-cols-3">
              {[
                ["Choose a storyteller", "Each one has their own voice, style and pace. Pick the AI model they run on, too: faster and cheaper, or richer and slower."],
                ["Create a character by talking", "Your storyteller asks who you want to be. Your answers fill in your character sheet: stats, gear, goals."],
                ["Play at your own pace", "Act, talk, tap a suggested action or roll when it matters. Stop anytime; the next session opens where you left off."],
              ].map(([title, body], i) => (
                <li key={title} className="rounded-2xl border border-border bg-card/70 p-6">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-semibold text-primary">{i + 1}</span>
                  <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="st-title" id="storytellers" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading id="st-title" eyebrow="Storytellers" title="Who will tell your story?">
              Four storytellers, four very different tables.
            </SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STORYTELLERS.map((s) => (
                <article key={s.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card" style={{ "--c": s.accentColor } as CSSProperties}>
                  <div
                    className="grid h-36 place-items-center"
                    style={{ background: `radial-gradient(circle at 50% 55%, ${s.accentColor}88, transparent 60%), linear-gradient(#0b0e13, ${s.accentColor}55)` }}
                    aria-hidden="true"
                  >
                    <span className="font-[family-name:var(--font-display)] text-7xl font-bold text-white/90">{s.name[0]}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{s.name}</h3>
                    <p className="text-sm text-muted-foreground">{s.tagline}</p>
                    <p className="mt-auto border-l-2 pl-3 font-[family-name:var(--font-display)] italic" style={{ borderColor: s.accentColor }}>
                      “{s.sampleLine}”
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="feat-title" className="border-t border-border/60 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHeading id="feat-title" eyebrow="Features" title="Everything a good table needs." />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-2xl border border-border bg-card/70 p-6">
                  <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="price-title" id="pricing" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-4xl px-5">
            <SectionHeading id="price-title" eyebrow="Pricing" title="Pay for what you play.">
              No subscription. Add funds when you need them, from ${MIN_TOPUP_CENTS / 100}. Each turn costs what it takes to run, plus {Math.round(MARKUP * 100)}%.
            </SectionHeading>
            <div className="grid gap-4 sm:grid-cols-3">
              {priced.map(({ m, typical }) => (
                <div key={m.id} className={`rounded-2xl border p-6 ${m.id === "haiku" ? "border-primary bg-primary/10" : "border-border bg-card/70"}`}>
                  <p className="text-sm text-muted-foreground">{m.id === "haiku" ? "Default" : " "}</p>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{m.name.replace("Claude ", "")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{m.tagline}</p>
                  <p className="mt-4 font-mono text-2xl tabular-nums">~{formatUsd(typical)}</p>
                  <p className="text-xs text-muted-foreground">per typical turn</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-muted-foreground">
              New players get <span className="text-foreground">{formatUsd(SIGNUP_CREDIT_MICROS)}</span> free: about {freeTurns.toLocaleString("en-US")} turns on Haiku.
              You can switch models anytime.
            </p>
          </div>
        </section>

        <section aria-labelledby="faq-title" id="faq" className="scroll-mt-20 border-t border-border/60 py-20">
          <div className="mx-auto max-w-3xl px-5">
            <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered." />
            <div className="flex flex-col gap-3">
              {[
                ["Is this Dungeons & Dragons?", "Dreampool isn't affiliated with Wizards of the Coast. Its rules are compatible with fifth edition, based on the openly licensed SRD, and it works with any setting you like."],
                ["Can I play with friends?", "Not yet. Dreampool is built for one player at a time today. Playing together is on our roadmap."],
                ["Can I talk instead of type?", "Voice play is paused for maintenance while we move to our new storyteller. Text play works now, and voice will return with a distinct voice for every character."],
                ["What happens to my story?", "It's saved as you play: your character, quests, the people you've met and a journal entry for every session. You can download your save file and import it again later."],
                ["How much does it cost?", `Each turn is charged at what it costs us to run plus ${Math.round(MARKUP * 100)}%. On the default model that's a fraction of a cent. You start with ${formatUsd(SIGNUP_CREDIT_MICROS)} free and add funds from $${MIN_TOPUP_CENTS / 100} when you need more.`],
              ].map(([q, a]) => (
                <details key={q} className="group rounded-xl border border-border bg-card/70 px-5 py-4 open:bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {q}
                    <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-5 text-center">
            <h2 className="text-balance font-[family-name:var(--font-display)] text-4xl font-semibold sm:text-5xl">The table is set.</h2>
            <p className="text-lg text-muted-foreground">Your storyteller is waiting. It takes a minute to start.</p>
            <StartButton />
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-sm text-muted-foreground">
          <Brand href="/" />
          <p>Not affiliated with Wizards of the Coast. Game rules are compatible with the System Reference Document 5.1 (CC-BY-4.0).</p>
          <p>© {new Date().getFullYear()} Dreampool</p>
        </div>
      </footer>
    </div>
  );
}
