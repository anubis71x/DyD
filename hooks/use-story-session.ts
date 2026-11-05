"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, SaveFile } from "@/lib/save/schema";
import type { TableEvent, TranscriptLine, TurnInput } from "@/lib/storyteller/events";
import type { ModelId } from "@/lib/storyteller/models";

export type FeedLine = TranscriptLine & { id: number; live?: boolean } | { id: number; kind: "notice"; speaker: "system"; text: string };

export interface DiceView {
  by: "player" | "storyteller";
  label: string;
  total: number;
  natural?: number;
  breakdown: string;
  dc?: number;
  outcome?: "success" | "failure";
}

export interface StoryState {
  status: "loading" | "ready" | "error";
  loadError?: string;
  save?: SaveFile;
  balanceMicros: number;
  lastTurnCostMicros: number | null;
  /** The player ended the session; waiting for them to begin the next one. */
  sessionEnded: boolean;
  endingSession: boolean;
  sessionNo: number | null;
  lines: FeedLine[];
  busy: boolean;
  speaker?: string;
  choices: string[];
  check?: { label: string; notation: string; dc?: number };
  dice: DiceView[];
  scene?: { asset: Asset; status: "pending" | "unavailable" | "ready" };
  handout?: Asset;
  ambience?: string;
  error?: { code: string; message: string };
  changed: { character: boolean; quests: boolean; cast: boolean; map: boolean };
}

let nextId = 1;
/** Increments per turn, so a finished turn's late cleanup can't touch the next one. */
let turnSeq = 0;

function diceView(e: Extract<TableEvent, { type: "dice" }>): DiceView {
  const r = e.roll;
  const mod = r.modifier ? ` ${r.modifier > 0 ? "+" : "−"} ${Math.abs(r.modifier)}` : "";
  const faces = r.advantage !== "none" ? `${r.rolls.join(", ")} → ${r.kept[0]}` : r.rolls.join(" + ");
  return {
    by: e.by,
    label: e.label,
    total: r.total,
    ...(r.natural !== undefined ? { natural: r.natural } : {}),
    breakdown: `${r.notation} · [${faces}]${mod}`,
    ...(e.dc !== undefined ? { dc: e.dc } : {}),
    ...(e.outcome ? { outcome: e.outcome } : {}),
  };
}

function diffSections(prev: SaveFile | undefined, next: SaveFile) {
  if (!prev) return { character: false, quests: false, cast: false, map: false };
  const j = (x: unknown) => JSON.stringify(x);
  return {
    character: j(prev.character) !== j(next.character),
    quests: j(prev.quests) !== j(next.quests),
    cast: j(prev.npcs) !== j(next.npcs),
    map: j(prev.world) !== j(next.world),
  };
}

/** Fold one streamed event into state. Exported for testing. */
export function reduceEvent(s: StoryState, e: TableEvent): StoryState {
  switch (e.type) {
    case "turn.start":
      return { ...s, sessionNo: e.sessionNo };
    case "speech": {
      const lines = [...s.lines];
      const last = lines[lines.length - 1];
      const kind = e.speaker === "narrator" ? "narration" : "npc";
      if (last && last.kind === kind && "live" in last && last.live && last.speaker === e.speaker && last.mood === e.mood) {
        lines[lines.length - 1] = { ...last, text: last.text + e.text };
      } else {
        if (!e.text.trim()) return s;
        lines.push({ id: nextId++, kind, speaker: e.speaker, ...(e.mood ? { mood: e.mood } : {}), text: e.text.trimStart(), live: true });
      }
      return { ...s, lines, speaker: e.speaker };
    }
    case "speech.end":
      return {
        ...s,
        speaker: undefined,
        lines: s.lines
          .map((l) => ("live" in l && l.live ? { ...l, live: false, text: l.text.trim() } : l))
          .filter((l) => l.text.length > 0),
      };
    case "state": {
      const d = diffSections(s.save, e.save);
      return {
        ...s,
        save: e.save,
        changed: {
          character: s.changed.character || d.character,
          quests: s.changed.quests || d.quests,
          cast: s.changed.cast || d.cast,
          map: s.changed.map || d.map,
        },
      };
    }
    case "choices":
      return { ...s, choices: e.choices };
    case "check":
      return { ...s, check: { label: e.label, notation: e.notation, ...(e.dc !== undefined ? { dc: e.dc } : {}) } };
    case "dice":
      return { ...s, dice: [diceView(e), ...s.dice].slice(0, 8) };
    case "image":
      return { ...s, scene: { asset: e.asset, status: e.status } };
    case "handout":
      return { ...s, handout: e.asset };
    case "ambience":
      return { ...s, ambience: e.mood };
    case "cast":
      return { ...s, lines: [...s.lines, { id: nextId++, kind: "notice", speaker: "system", text: `New voice cast: ${e.label}` }] };
    case "notice":
      return { ...s, lines: [...s.lines, { id: nextId++, kind: "notice", speaker: "system", text: e.message }] };
    case "error":
      return { ...s, error: { code: e.code, message: e.message } };
    case "done":
      // The turn is over for the player (the server may still be tidying up, e.g. compacting).
      return { ...s, busy: false, balanceMicros: e.balanceMicros, lastTurnCostMicros: e.turnCostMicros };
  }
}

const initial: StoryState = {
  status: "loading",
  balanceMicros: 0,
  lastTurnCostMicros: null,
  sessionEnded: false,
  endingSession: false,
  sessionNo: null,
  lines: [],
  busy: false,
  choices: [],
  dice: [],
  changed: { character: false, quests: false, cast: false, map: false },
};

export function useStorySession(campaignId: string) {
  const [state, setState] = useState<StoryState>(initial);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
    if (!res.ok) {
      const msg = res.status === 404 ? "This campaign doesn't exist or isn't yours." : "Couldn't load the campaign.";
      setState((s) => ({ ...s, status: "error", loadError: msg }));
      return null;
    }
    const data = (await res.json()) as { save: SaveFile; balanceMicros: number; sessionNo: number | null; transcript: TranscriptLine[] };
    const lastImage = [...data.save.assets].reverse().find((a) => a.kind === "image");
    setState((s) => ({
      ...s,
      status: "ready",
      save: data.save,
      balanceMicros: data.balanceMicros,
      sessionNo: data.sessionNo,
      lines: data.transcript.map((l) => ({ ...l, id: nextId++ })),
      ...(lastImage ? { scene: { asset: lastImage, status: lastImage.url ? "ready" : "unavailable" } } : {}),
    }));
    return data;
  }, [campaignId]);

  const send = useCallback(
    async (input: TurnInput) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const myTurn = ++turnSeq;
      let turnDone = false;
      const playerLine: FeedLine | null =
        input.type === "text" || input.type === "choice" ? { id: nextId++, kind: "player", speaker: "player", text: input.text } : null;
      setState((s) => ({
        ...s,
        busy: true,
        sessionEnded: false,
        error: undefined,
        choices: [],
        ...(input.type === "roll" ? { check: undefined } : {}),
        lines: playerLine ? [...s.lines, playerLine] : s.lines,
      }));

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          setState((s) => ({ ...s, error: { code: "http", message: body.error ?? "The storyteller couldn't be reached." } }));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const event = JSON.parse(line.slice(6)) as TableEvent;
              if (event.type === "done") {
                // The turn is over for the player. The stream may stay open while the
                // server compacts a long history; the next turn can start meanwhile.
                turnDone = true;
                if (turnSeq === myTurn) busyRef.current = false;
              }
              if (event.type === "dice" && event.by === "player") {
                setState((s) => reduceEvent({ ...s, lines: [...s.lines, { id: nextId++, kind: "dice", speaker: "player", text: `${event.label}: ${event.roll.total}${event.outcome ? ` (${event.outcome})` : ""}` }] }, event));
              } else if (!(turnDone && event.type !== "done" && turnSeq !== myTurn)) {
                setState((s) => reduceEvent(s, event));
              }
            }
          }
        }
      } catch (err) {
        // A drop after "done" (e.g. during compaction) isn't something the player needs to see.
        if ((err as Error).name !== "AbortError" && !turnDone) {
          setState((s) => ({ ...s, error: { code: "network", message: "Connection lost. Your progress is saved; reload to continue." } }));
        }
      } finally {
        if (turnSeq === myTurn) {
          busyRef.current = false;
          abortRef.current = null;
          setState((s) => reduceEvent({ ...s, busy: false }, { type: "speech.end" }));
        }
      }
    },
    [campaignId],
  );

  const clearChanged = useCallback((key: keyof StoryState["changed"]) => {
    setState((s) => ({ ...s, changed: { ...s.changed, [key]: false } }));
  }, []);
  const setModel = useCallback(
    async (modelId: ModelId) => {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState((s) => ({ ...s, error: { code: "http", message: body.error ?? "Couldn't switch models." } }));
        return;
      }
      setState((s) => ({ ...s, save: body.save }));
    },
    [campaignId],
  );
  const endSession = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState((s) => ({ ...s, endingSession: true, error: undefined }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/session/end`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState((s) => ({ ...s, error: { code: "http", message: body.error ?? "Couldn't end the session." } }));
        return;
      }
      setState((s) => ({
        ...s,
        save: body.save,
        balanceMicros: body.balanceMicros,
        lines: [],
        choices: [],
        check: undefined,
        sessionNo: null,
        sessionEnded: true,
      }));
    } finally {
      busyRef.current = false;
      setState((s) => ({ ...s, endingSession: false }));
    }
  }, [campaignId]);

  /** Re-read the balance (e.g. after a top-up, which the webhook credits a moment later). */
  const refreshBalance = useCallback(async () => {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (res.ok) {
      const { balanceMicros } = await res.json();
      setState((s) => ({ ...s, balanceMicros, error: s.error?.code === "insufficient_funds" ? undefined : s.error }));
    }
  }, []);
  const dismissHandout = useCallback(() => setState((s) => ({ ...s, handout: undefined })), []);
  const dismissError = useCallback(() => setState((s) => ({ ...s, error: undefined })), []);

  useEffect(() => {
    let cancelled = false;
    load().then((data) => {
      // A brand-new campaign (or a new session) starts with the storyteller speaking first.
      if (!cancelled && data && data.transcript.length === 0) void send({ type: "begin" });
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [load, send]);

  return { state, send, setModel, endSession, refreshBalance, clearChanged, dismissHandout, dismissError };
}
