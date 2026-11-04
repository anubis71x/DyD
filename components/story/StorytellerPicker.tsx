"use client";

import { useState } from "react";
import { STORYTELLERS, type Storyteller } from "@/lib/storyteller/storytellers";
import { VOICE_BY_ID } from "@/lib/storyteller/voices";
import { AccentScope, Chip } from "./ui";

function StorytellerCard({ st, selected, onSelect }: { st: Storyteller; selected: boolean; onSelect: () => void }) {
  const [showSample, setShowSample] = useState(false);
  return (
    <AccentScope color={st.accentColor} className="h-full">
      <div
        className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-[#151a22] transition ${
          selected ? "border-[color:var(--accent)] shadow-[0_18px_50px_-20px_var(--accent)]" : "border-white/10 hover:border-white/25"
        }`}
      >
        <button type="button" onClick={onSelect} aria-pressed={selected} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]">
          <div
            className="relative grid h-40 place-items-center"
            style={{ background: `radial-gradient(circle at 50% 55%, ${st.accentColor}88, transparent 60%), linear-gradient(#0b0e13, ${st.accentColor}55)` }}
          >
            <span className="font-[family-name:var(--font-display)] text-8xl font-bold text-white/90 [text-shadow:0_4px_30px_var(--accent)]">{st.name[0]}</span>
            {st.isNew && <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/50 px-2 py-0.5 text-[11px] text-zinc-300">New</span>}
            {selected && <span className="absolute right-3 top-3 rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[#14100b]">Selected</span>}
          </div>
          <div className="flex flex-col gap-2 p-4 pb-2">
            <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{st.name}</h3>
            <p className="min-h-[3.75rem] text-sm text-zinc-400">{st.tagline}</p>
            <div className="flex flex-wrap gap-1.5">
              {st.styleTags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </div>
          </div>
        </button>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-4 pt-2">
          <button
            type="button"
            onClick={() => setShowSample((v) => !v)}
            aria-expanded={showSample}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 py-1 pl-1 pr-3 text-xs hover:border-[color:var(--accent)]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--accent)] text-[9px] text-[#14100b]">▶</span>
            Sample line
          </button>
          <span className="text-xs text-zinc-500">{st.languages.join(" · ")}</span>
          {showSample && (
            <p className="w-full border-l-2 border-[color:var(--accent)] pl-3 font-[family-name:var(--font-display)] text-base italic text-zinc-200">
              “{st.sampleLine}”
              <span className="mt-1 block font-sans text-[11px] not-italic text-zinc-500">
                Narrated in {VOICE_BY_ID.get(st.narrationVoiceId)?.label}. Audio samples return with voice play.
              </span>
            </p>
          )}
        </div>
      </div>
    </AccentScope>
  );
}

export function StorytellerPicker({ onStart, busy }: { onStart: (storytellerId: string) => void; busy: boolean }) {
  const [selected, setSelected] = useState(STORYTELLERS[0].id);
  const st = STORYTELLERS.find((s) => s.id === selected)!;
  return (
    <section aria-labelledby="pick-heading" className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <h2 id="pick-heading" className="font-[family-name:var(--font-display)] text-4xl font-semibold">Who will tell your story?</h2>
        <p className="mt-2 text-zinc-400">
          Your storyteller narrates, sets the pace and runs the rules. They keep their own voice and cast new voices for every character you meet.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STORYTELLERS.map((s) => (
          <StorytellerCard key={s.id} st={s} selected={s.id === selected} onSelect={() => setSelected(s.id)} />
        ))}
      </div>
      <AccentScope color={st.accentColor}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#151a22]/90 p-4">
          <p className="text-sm text-zinc-400">
            <span className="font-semibold text-zinc-100">{st.name}</span> · {st.styleTags.join(", ")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStart(st.id)}
            className="rounded-full bg-[color:var(--accent)] px-5 py-2.5 font-semibold text-[#14100b] transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Setting the table…" : `Begin with ${st.name.split(" ")[0]} →`}
          </button>
        </div>
      </AccentScope>
    </section>
  );
}
