"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStorySession, type DiceView, type FeedLine, type StoryState } from "@/hooks/use-story-session";
import type { SaveFile } from "@/lib/save/schema";
import { DEFAULT_MODEL_ID, getModel } from "@/lib/storyteller/models";
import { getStoryteller } from "@/lib/storyteller/storytellers";
import { voiceLabel } from "@/lib/storyteller/voices";
import type { TurnInput } from "@/lib/storyteller/events";
import { AddFundsDialog } from "@/components/billing/AddFunds";
import { formatUsd } from "@/lib/billing/money";
import { ModelSelect, perTurn } from "./ModelPicker";
import { AccentScope, Chip, npcColor, Portrait } from "./ui";

const mix = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;

/* ---------------------------------------------------------------- feed */

function Line({ line, save, speaking }: { line: FeedLine; save: SaveFile; speaking: boolean }) {
  const st = getStoryteller(save.storytellerId);
  if (line.kind === "notice") {
    return <p className="flex max-w-[68ch] items-center gap-2 text-xs text-zinc-500 before:h-px before:w-5 before:bg-white/10">{line.text}</p>;
  }
  if (line.kind === "dice") {
    return <p className="max-w-[68ch] self-end font-mono text-xs text-zinc-400">🎲 {line.text}</p>;
  }
  if (line.kind === "player") {
    return (
      <div className="flex max-w-[68ch] flex-row-reverse gap-3 self-end text-right">
        <Portrait name={save.character.name || "You"} color="#d9cfb8" />
        <div>
          <div className="mb-0.5 text-xs text-zinc-500">{save.character.name || "You"}</div>
          <p className="rounded-xl rounded-tr-sm border px-3 py-2 text-left" style={{ background: mix(14), borderColor: mix(40) }}>{line.text}</p>
        </div>
      </div>
    );
  }
  if (line.kind === "narration") {
    return (
      <div className="flex max-w-[68ch] gap-3">
        <Portrait name={st.name} color={st.accentColor} />
        <div>
          <div className="mb-0.5 flex items-center gap-2 text-xs text-zinc-500">{st.name}</div>
          <p
            className="whitespace-pre-line font-[family-name:var(--font-display)] text-xl leading-relaxed text-zinc-100"
            style={speaking ? { textShadow: `0 0 18px ${mix(35)}` } : undefined}
          >
            {line.text}
          </p>
        </div>
      </div>
    );
  }
  const npc = save.npcs.find((n) => n.id === line.speaker);
  const name = npc?.name ?? line.speaker;
  const color = npcColor(line.speaker);
  const voice = voiceLabel(npc?.voiceId, save.generatedVoices);
  return (
    <div className="flex max-w-[68ch] gap-3">
      <Portrait name={name} color={color} />
      <div>
        <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          {name}
          {voice && <Chip>{voice}</Chip>}
          {line.mood && <span className="italic">{line.mood}</span>}
        </div>
        <p
          className="whitespace-pre-line rounded-xl rounded-tl-sm border border-white/10 bg-[#151a22] px-3 py-2"
          style={{ borderLeft: `3px solid ${color}`, ...(speaking ? { boxShadow: `0 0 0 1px var(--accent)` } : {}) }}
        >
          {line.text}
        </p>
      </div>
    </div>
  );
}

function Feed({ state, send }: { state: StoryState; send: (i: TurnInput) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = state.lines[state.lines.length - 1];
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [state.lines.length, last?.text]);
  const save = state.save!;
  const recap = save.memory.sessionRecaps[save.memory.sessionRecaps.length - 1];
  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-8" aria-live="polite">
      {recap && (
        <div className="max-w-[68ch] rounded-xl border border-white/10 p-4" style={{ background: `linear-gradient(135deg, ${mix(14)}, transparent 60%)` }}>
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">Previously in {save.title}</h3>
          <p className="text-sm text-zinc-400">{recap.summary}</p>
          {save.memory.nextSessionHooks.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-zinc-500">
              {save.memory.nextSessionHooks.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.sessionEnded && (
        <div className="flex max-w-[68ch] flex-col items-start gap-3 rounded-xl border border-white/10 bg-[#151a22] p-4">
          <p className="text-sm text-zinc-400">
            {recap ? "Session ended and saved to your journal. The recap above opens your next session." : "Session ended. There wasn't enough story yet for a recap."}
          </p>
          <button type="button" onClick={() => send({ type: "begin" })} className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[#14100b] hover:brightness-110">
            Begin the next session
          </button>
        </div>
      )}
      {state.lines.map((l) => (
        <Line key={l.id} line={l} save={save} speaking={"live" in l && !!l.live} />
      ))}
      {state.busy && !state.speaker && (
        <p className="text-sm text-zinc-500" role="status">
          {getStoryteller(save.storytellerId).name.split(" ")[0]} is thinking<span className="animate-pulse">…</span>
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- input */

function InputPanel({ state, send }: { state: StoryState; send: (i: TurnInput) => void }) {
  const [text, setText] = useState("");
  const st = getStoryteller(state.save!.storytellerId);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || state.busy) return;
    setText("");
    send({ type: "text", text: t });
  };
  const speakerName =
    state.speaker === "narrator" ? st.name : state.save!.npcs.find((n) => n.id === state.speaker)?.name ?? state.speaker;
  return (
    <section aria-label="Your turn" className="mx-3 mb-3 grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-[#151a22] p-3 sm:mx-6 md:grid-cols-[auto_1fr_auto]">
      <button
        type="button"
        disabled
        title="Voice play is paused for maintenance"
        aria-label="Microphone (paused for maintenance)"
        className="grid h-14 w-14 place-items-center rounded-full bg-white/5 text-zinc-600"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
        </svg>
      </button>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <span className={`h-2 w-2 rounded-full ${state.speaker ? "bg-[color:var(--accent)] shadow-[0_0_8px_var(--accent)]" : "bg-zinc-600"}`} />
          {state.speaker ? (
            <span>
              <b className="font-semibold text-zinc-200">{speakerName}</b> is speaking
            </span>
          ) : state.busy ? (
            "The storyteller is working on it…"
          ) : (
            <span>
              <b className="font-semibold text-zinc-200">Your turn.</b> Type what you do or say, or pick an action.
            </span>
          )}
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="turn-input" className="sr-only">What do you do?</label>
          <textarea
            id="turn-input"
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="I lean on the desk and ask about the singing…"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-[#1c222d] px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600 focus:border-[color:var(--accent)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={state.busy || !text.trim()}
            className="rounded-xl bg-[color:var(--accent)] px-4 font-semibold text-[#14100b] transition hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 md:col-span-1 md:flex-col md:items-end">
        <div className="inline-flex rounded-full border border-white/10 bg-[#1c222d] p-0.5 text-xs" role="group" aria-label="Input mode">
          <button type="button" disabled className="rounded-full px-3 py-1 text-zinc-600" title="Paused for maintenance">Tap to talk</button>
          <button type="button" disabled className="rounded-full px-3 py-1 text-zinc-600" title="Paused for maintenance">Open mic</button>
          <button type="button" aria-pressed="true" className="rounded-full bg-[#151a22] px-3 py-1 text-zinc-100 ring-1 ring-white/10">Text</button>
        </div>
        <span className="text-[11px] text-zinc-500">
          Voice is paused for maintenance · {state.lastTurnCostMicros !== null ? `last turn ${formatUsd(state.lastTurnCostMicros)}` : perTurn(state.save!.modelId)}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ side panel */

function ScenePanel({ state }: { state: StoryState }) {
  const scene = state.scene;
  const seed = scene ? Array.from(scene.asset.id).reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  return (
    <section aria-labelledby="scene-h" className="flex flex-col gap-3 border-b border-white/10 p-4">
      <div className="flex items-center justify-between">
        <h2 id="scene-h" className="font-[family-name:var(--font-display)] text-xl font-semibold">Scene</h2>
        {state.ambience && <Chip tone="accent">♪ {state.ambience}</Chip>}
      </div>
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10"
        style={{
          background: scene?.asset.url
            ? `center/cover url(${JSON.stringify(scene.asset.url)})`
            : `radial-gradient(circle at ${30 + (seed % 40)}% ${35 + (seed % 25)}%, ${mix(55)}, transparent 55%), linear-gradient(#0a0d12, #1a2230)`,
        }}
      >
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
          {scene ? (
            <>
              <b className="block font-[family-name:var(--font-display)] text-lg">{scene.asset.title}</b>
              {!scene.asset.url && <p className="line-clamp-3 text-xs text-zinc-400">{scene.asset.prompt}</p>}
            </>
          ) : (
            <p className="text-xs text-zinc-400">Scenes the storyteller paints will appear here.</p>
          )}
        </div>
      </div>
      {scene && !scene.asset.url && <p className="text-[11px] text-zinc-500">Illustrations are coming soon. For now you see the storyteller&apos;s description.</p>}
      {state.handout && <Handout state={state} />}
    </section>
  );
}

function Handout({ state }: { state: StoryState }) {
  const h = state.handout!;
  return (
    <article className="rounded-xl border border-amber-200/20 bg-[#e9dfc8] p-4 text-[#2b2116] shadow-lg">
      <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">{h.title}</h3>
      <p className="mt-1 whitespace-pre-line font-[family-name:var(--font-display)] text-base leading-snug">{h.body}</p>
    </article>
  );
}

const DICE = [4, 6, 8, 10, 12, 20, 100];

function DieFace({ value, rolling }: { value: number | string; rolling: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`h-24 w-24 drop-shadow-xl ${rolling ? "animate-spin" : ""}`} aria-hidden="true">
      <polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill="var(--accent)" />
      <polygon points="50,20 80,70 20,70" fill="#0002" stroke="#0003" strokeWidth="1.5" />
      <path d="M50 4 50 20 M92 27 80 70 M8 27 20 70 M50 96 50 70 M92 73 80 70 M8 73 20 70 M8 27 50 20 92 27" stroke="#0003" strokeWidth="1.5" fill="none" />
      <text x="50" y="60" textAnchor="middle" className="fill-[#14100b] font-mono text-[26px] font-bold">{value}</text>
    </svg>
  );
}

function DicePanel({ state, send }: { state: StoryState; send: (i: TurnInput) => void }) {
  const [die, setDie] = useState(20);
  const [mod, setMod] = useState(0);
  const [adv, setAdv] = useState<"none" | "advantage" | "disadvantage">("none");
  const latest: DiceView | undefined = state.dice[0];
  const check = state.check;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  // The server uses its own record of the check (dice, DC, advantage); these fields are informational.
  const rollCheck = () => check && send({ type: "roll", notation: check.notation, label: check.label });
  const rollFree = () => send({ type: "roll", notation: `d${die}${mod ? sign(mod) : ""}`, label: `Free roll d${die}`, advantage: die === 20 ? adv : "none" });

  return (
    <section aria-labelledby="dice-h" className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 id="dice-h" className="font-[family-name:var(--font-display)] text-xl font-semibold">Dice</h2>
        <span className="text-[11px] text-zinc-500">Rolled on the server</span>
      </div>

      {check && (
        <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--accent)] p-3" style={{ background: mix(14) }} role="status">
          <b className="font-[family-name:var(--font-display)] text-lg">{check.label}</b>
          <div className="flex justify-between text-xs text-zinc-400">
            <span>Requested by the storyteller</span>
            <span className="font-mono">{check.notation}{check.dc ? ` · DC ${check.dc}` : ""}</span>
          </div>
          <button type="button" disabled={state.busy} onClick={rollCheck} className="rounded-full bg-[color:var(--accent)] py-2 font-semibold text-[#14100b] hover:brightness-110 disabled:opacity-50">
            Roll {check.notation}{check.advantage ? ` with ${check.advantage}` : ""}
          </button>
        </div>
      )}

      <div className="grid grid-cols-[96px_1fr] items-center gap-3">
        <DieFace value={latest?.natural ?? latest?.total ?? die} rolling={state.busy && !latest} />
        <div aria-live="polite">
          {latest ? (
            <>
              <span className={`block font-mono text-4xl font-bold ${latest.outcome === "success" ? "text-emerald-300" : latest.outcome === "failure" ? "text-rose-300" : ""}`}>
                {latest.total}
              </span>
              <span className="block font-mono text-xs text-zinc-500">{latest.breakdown}</span>
              <span className="block font-[family-name:var(--font-display)] text-base">
                {latest.label}
                {latest.dc !== undefined && ` · ${latest.outcome === "success" ? "beats" : "misses"} DC ${latest.dc}`}
              </span>
              {latest.by === "storyteller" && <span className="text-[11px] text-zinc-500">Rolled by the storyteller</span>}
            </>
          ) : (
            <span className="text-sm text-zinc-500">No rolls yet this session.</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Die">
        {DICE.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={die === d}
            onClick={() => setDie(d)}
            className={`rounded-lg border py-2 font-mono text-xs ${die === d ? "border-[color:var(--accent)] text-[color:var(--accent)]" : "border-white/10 bg-[#1c222d]"}`}
          >
            d{d}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-[#1c222d]" aria-label="Modifier">
          <button type="button" onClick={() => setMod((m) => Math.max(-10, m - 1))} className="h-8 w-8" aria-label="Lower modifier">−</button>
          <span className="w-8 text-center font-mono text-sm">{sign(mod)}</span>
          <button type="button" onClick={() => setMod((m) => Math.min(20, m + 1))} className="h-8 w-8" aria-label="Raise modifier">+</button>
        </div>
        <div className="inline-flex rounded-full border border-white/10 bg-[#1c222d] p-0.5 text-xs" role="group" aria-label="Advantage">
          {(["none", "advantage", "disadvantage"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={adv === a} onClick={() => setAdv(a)} className={`rounded-full px-2.5 py-1 ${adv === a ? "bg-[#151a22] text-zinc-100 ring-1 ring-white/10" : "text-zinc-500"}`}>
              {a === "none" ? "Normal" : a === "advantage" ? "Adv" : "Dis"}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={state.busy || !!check}
        title={check ? "Roll the check the storyteller asked for first" : undefined}
        onClick={rollFree}
        className="rounded-full border border-white/15 py-2 text-sm hover:border-white/30 disabled:opacity-50"
      >
        Roll d{die}{mod ? ` ${sign(mod)}` : ""} and tell the storyteller
      </button>

      {state.dice.length > 1 && (
        <ul className="flex flex-col gap-1 text-xs text-zinc-500" aria-label="Roll history">
          {state.dice.slice(1).map((d, i) => (
            <li key={i} className="flex justify-between border-b border-dashed border-white/10 pb-1">
              <span>{d.label}</span>
              <b className="font-mono text-zinc-300">{d.total}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- drawer */

type DrawerKey = "character" | "quests" | "cast" | "map";

function Meter({ label, current, max }: { label: string; current: number; max?: number }) {
  const pct = max ? Math.max(0, Math.min(100, (current / max) * 100)) : 100;
  const low = max !== undefined && current / max < 0.3;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono">{current}{max !== undefined ? ` / ${max}` : ""}</span>
      </div>
      {max !== undefined && (
        <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-[#1c222d]">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: low ? "#e07a6e" : /hp|health/i.test(label) ? "#7fbf8e" : "var(--accent)" }} />
        </div>
      )}
    </div>
  );
}

function DrawerBody({ which, save }: { which: DrawerKey; save: SaveFile }) {
  const c = save.character;
  const card = "rounded-lg border border-white/10 bg-[#1c222d] px-3 py-2 text-sm";
  if (which === "character") {
    if (!c.name) return <p className="text-sm text-zinc-500">Your character takes shape as you talk with the storyteller.</p>;
    return (
      <>
        <p className="-mt-2 text-sm text-zinc-400">{[c.classRole, c.level !== undefined ? `Level ${c.level}` : ""].filter(Boolean).join(" · ")}</p>
        {Object.entries(c.resources).map(([k, r]) => <Meter key={k} label={k} current={r.current} max={r.max} />)}
        {Object.keys(c.attributes).length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(c.attributes).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/10 bg-[#1c222d] p-2 text-center">
                <b className="block font-mono text-lg">{v}</b>
                <span className="text-[11px] text-zinc-500">{k}</span>
              </div>
            ))}
          </div>
        )}
        {c.inventory.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="font-[family-name:var(--font-display)] text-lg">Inventory</h3>
            {c.inventory.map((i) => (
              <div key={i.name} className={card}>
                {i.name}{i.qty > 1 && <span className="text-zinc-500"> ×{i.qty}</span>}
                {i.notes && <small className="block text-xs text-zinc-500">{i.notes}</small>}
              </div>
            ))}
          </div>
        )}
        {c.abilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">{c.abilities.map((a) => <Chip key={a}>{a}</Chip>)}</div>
        )}
        {c.goals.length > 0 && (
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-lg">Goals</h3>
            <ul className="list-disc pl-5 text-sm text-zinc-300">{c.goals.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        )}
      </>
    );
  }
  if (which === "quests") {
    if (!save.quests.length) return <p className="text-sm text-zinc-500">No quests yet.</p>;
    const order = { active: 0, completed: 1, failed: 2 } as const;
    return (
      <>
        {[...save.quests].sort((a, b) => order[a.status] - order[b.status]).map((q) => (
          <div key={q.id} className={card}>
            <div className="flex items-center justify-between gap-2">
              <b>{q.title}</b>
              <Chip tone={q.status === "completed" ? "good" : q.status === "failed" ? "bad" : "accent"}>{q.status}</Chip>
            </div>
            {q.description && <p className="mt-1 text-xs text-zinc-400">{q.description}</p>}
            {q.objectives.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                {q.objectives.map((o) => (
                  <li key={o.text} className={o.done ? "text-zinc-500 line-through" : ""}>{o.done ? "☑" : "☐"} {o.text}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </>
    );
  }
  if (which === "cast") {
    if (!save.npcs.length) return <p className="text-sm text-zinc-500">You haven&apos;t met anyone yet.</p>;
    return (
      <>
        {save.npcs.map((n) => (
          <div key={n.id} className={`${card} flex gap-3`}>
            <Portrait name={n.name} color={npcColor(n.id)} size={34} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <b>{n.name}</b>
                <Chip tone={n.disposition === "friendly" ? "good" : n.disposition === "hostile" ? "bad" : "muted"}>{n.disposition}</Chip>
              </div>
              {n.description && <p className="text-xs text-zinc-400">{n.description}</p>}
              {n.lastInteraction && <p className="text-xs text-zinc-500">Last: {n.lastInteraction}</p>}
              <p className="text-xs text-zinc-500">Voice: {voiceLabel(n.voiceId, save.generatedVoices) ?? "not cast yet"}</p>
            </div>
          </div>
        ))}
      </>
    );
  }
  const w = save.world;
  return (
    <>
      {w.inGameTime && <p className="text-sm text-zinc-400">{w.inGameTime}</p>}
      {w.locations.length === 0 && <p className="text-sm text-zinc-500">No places discovered yet.</p>}
      {w.locations.map((l) => (
        <div key={l.name} className={card}>
          <b>{l.name}</b>
          <small className="block text-xs text-zinc-500">{l.name === w.currentLocation ? "You are here" : l.discovered ? "Discovered" : "Heard of"}{l.notes ? ` · ${l.notes}` : ""}</small>
        </div>
      ))}
      {w.factions.length > 0 && (
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-lg">Factions</h3>
          {w.factions.map((f) => (
            <p key={f.name} className="flex justify-between text-sm">
              <span>{f.name}</span>
              <span className="font-mono text-zinc-400">{f.standing > 0 ? `+${f.standing}` : f.standing}</span>
            </p>
          ))}
        </div>
      )}
    </>
  );
}

const RAIL: { key: DrawerKey; label: string; path: string }[] = [
  { key: "character", label: "Hero", path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" },
  { key: "quests", label: "Quests", path: "M6 3h10l2 3v15H6zM9 9h6M9 13h6M9 17h4" },
  { key: "cast", label: "Cast", path: "M9 12.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM16.5 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM3 20c1-3.5 3.3-5 6-5s5 1.5 6 5M14 15.5c2.6-.6 5.3.6 6.5 4" },
  { key: "map", label: "Map", path: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" },
];

/* ----------------------------------------------------------------- table */

export function StoryTable({ campaignId }: { campaignId: string }) {
  const { state, send, setModel, endSession, refreshBalance, clearChanged, dismissError } = useStorySession(campaignId);
  const [fundsOpen, setFundsOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKey | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (state.status === "loading") return <p className="p-8 text-zinc-500">Setting the table…</p>;
  if (state.status === "error" || !state.save) {
    return (
      <div className="p-8">
        <p className="text-rose-300">{state.loadError}</p>
        <Link href="/dashboard/narrator" className="mt-3 inline-block underline">Back to your campaigns</Link>
      </div>
    );
  }
  const save = state.save;
  const st = getStoryteller(save.storytellerId);
  const title = { character: save.character.name || "Your character", quests: "Quest log", cast: "Characters met", map: "Map" };

  return (
    <AccentScope color={st.accentColor} className="flex h-[calc(100vh-7rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1015] text-zinc-100 max-lg:h-auto">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#151a22] px-4 py-2.5">
        <Link href="/dashboard/narrator" className="text-sm text-zinc-500 hover:text-zinc-200" aria-label="Back to your campaigns">←</Link>
        <div className="min-w-0">
          <b className="block truncate font-[family-name:var(--font-display)] text-xl font-semibold">{save.title}</b>
          <span className="text-xs text-zinc-500">{state.sessionNo ? `Session ${state.sessionNo} · ` : ""}told by {st.name}</span>
        </div>
        <div className="flex-1" />
        <ModelSelect value={save.modelId ?? DEFAULT_MODEL_ID} onChange={setModel} disabled={state.busy} />
        {state.sessionNo !== null && !state.sessionEnded && (
          <button
            type="button"
            onClick={() => void endSession()}
            disabled={state.busy || state.endingSession}
            title="Write this session to your journal and start fresh next time"
            className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-50 md:inline"
          >
            {state.endingSession ? "Writing recap…" : "End session"}
          </button>
        )}
        <span className="hidden rounded-full border border-white/10 bg-[#1c222d] px-3 py-1 text-xs text-zinc-400 xl:inline">✓ Saved · rev {save.revision}</span>
        <a href={`/api/campaigns/${campaignId}/export`} className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-100 md:inline">Download save</a>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1c222d] px-3 py-1 text-sm">
          <span className="font-mono">{formatUsd(state.balanceMicros)}</span>
          <button type="button" onClick={() => setFundsOpen(true)} className="ml-1 rounded-full px-1.5 text-zinc-400 hover:text-zinc-100" aria-label="Add funds">+</button>
        </span>
        <AddFundsDialog
          open={fundsOpen}
          onClose={() => setFundsOpen(false)}
          onFunded={() => [2000, 5000, 10000].forEach((ms) => setTimeout(() => void refreshBalance(), ms))}
        />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[64px_minmax(0,1fr)_360px]">
        <nav aria-label="Campaign panels" className="flex justify-around border-b border-white/10 bg-[#151a22] p-1.5 lg:flex-col lg:justify-start lg:gap-1 lg:border-b-0 lg:border-r lg:py-3">
          {RAIL.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-expanded={drawer === r.key}
              onClick={() => {
                setDrawer((d) => (d === r.key ? null : r.key));
                clearChanged(r.key);
              }}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-[10px] lg:mx-auto ${drawer === r.key ? "bg-[#1c222d] text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={r.path} /></svg>
              {r.label}
              {state.changed[r.key] && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-[color:var(--accent)]" aria-label="updated" />}
            </button>
          ))}
        </nav>

        <main className="relative flex min-h-[60vh] flex-col overflow-hidden">
          <aside
            aria-hidden={!drawer}
            className={`absolute inset-y-0 left-0 z-10 flex w-full max-w-sm flex-col border-r border-white/10 bg-[#151a22] shadow-2xl transition-transform duration-200 ${drawer ? "translate-x-0" : "invisible -translate-x-full"}`}
          >
            {drawer && (
              <>
                <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{title[drawer]}</h2>
                  <button type="button" onClick={() => setDrawer(null)} className="h-8 w-8 rounded-lg bg-[#1c222d]" aria-label="Close panel">✕</button>
                </header>
                <div className="flex flex-col gap-3 overflow-y-auto p-4">
                  <DrawerBody which={drawer} save={save} />
                </div>
              </>
            )}
          </aside>

          <Feed state={state} send={send} />

          {state.error && (
            <div role="alert" className="mx-3 mb-2 flex items-start justify-between gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 sm:mx-6">
              <span>
                {state.error.message}
                {state.error.code === "insufficient_funds" && (
                  <> <button type="button" onClick={() => setFundsOpen(true)} className="underline">Add funds</button></>
                )}
              </span>
              <button type="button" onClick={dismissError} aria-label="Dismiss" className="text-rose-200/70 hover:text-rose-100">✕</button>
            </div>
          )}

          {state.choices.length > 0 && !state.busy && (
            <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-8" aria-label="Suggested actions">
              {state.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => send({ type: "choice", text: c })}
                  className="rounded-full border border-white/10 bg-[#151a22] px-3.5 py-1.5 text-sm hover:border-[color:var(--accent)]"
                >
                  {c}
                </button>
              ))}
              <button type="button" onClick={() => document.getElementById("turn-input")?.focus()} className="rounded-full border border-dashed border-white/15 px-3.5 py-1.5 text-sm text-zinc-500">
                Something else…
              </button>
            </div>
          )}

          <InputPanel state={state} send={send} />
        </main>

        <aside aria-label="Scene and dice" className="overflow-y-auto border-t border-white/10 bg-[#151a22] lg:border-l lg:border-t-0">
          <ScenePanel state={state} />
          <DicePanel state={state} send={send} />
        </aside>
      </div>
    </AccentScope>
  );
}
