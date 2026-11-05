/**
 * Terminal playtest for the storyteller. Runs the real engine (lib/storyteller)
 * against the real Claude API with in-memory stores: no database, no Clerk,
 * no money. Every model call is recorded with its usage, real cost and timing,
 * and every turn is audited (speaker tags, tool use, style; lib/playtest/audit.ts).
 *
 *   yarn play                                  Interactive game on Haiku 5.5
 *   yarn play --model sonnet --storyteller lyra
 *   yarn play --bot 12 --model opus            A Haiku "player" plays 12 turns
 *   yarn play --script tests/playtest/heist.txt --model haiku
 *   yarn play --bot 20 --compact-at 12000      Force compaction early to test it
 *   yarn play --bot 8 --sessions 2             End the session, check the recap and the "previously on…" opener
 *
 * Input lines (typed, from --script, or by the bot):
 *   any text        a turn                 /1 … /4      pick an offered choice
 *   /roll [d20+3]   roll (the pending check if there is one)
 *   /end            end the session (writes the journal recap)
 *   /compact        compact the session now
 *   /model haiku|sonnet|opus   switch model     /state   print the save file
 *   /cost           costs so far            /quit
 *
 * Output goes to .playtest/<run>/: log.jsonl (every event and call),
 * report.md (findings, costs vs lib/billing/pricing.ts estimates) and save.json.
 *
 * Needs ANTHROPIC_API_KEY. Requests go to https://api.anthropic.com unless
 * PLAYTEST_BASE_URL is set (ANTHROPIC_BASE_URL is ignored on purpose, so a
 * tool's own proxy setting can't capture the run).
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline/promises";
import { parseArgs } from "util";
import Anthropic from "@anthropic-ai/sdk";
import { auditTurn, type CallRecord, type Finding } from "../lib/playtest/audit";
import { formatUsd } from "../lib/billing/money";
import { MARKUP, responseCost, typicalTurnMicros, withMarkup, type CostLine } from "../lib/billing/pricing";
import { createMemoryStores } from "../lib/save/memoryStore";
import type { SaveFile } from "../lib/save/schema";
import { commitEvents, createCampaign, loadCampaign } from "../lib/save/service";
import { compactSession, ENGINE_CONFIG, endSession, runTurn } from "../lib/storyteller/engine";
import type { TableEvent, TurnInput } from "../lib/storyteller/events";
import { getModel, MODEL_IDS, type ModelId } from "../lib/storyteller/models";
import { NARRATOR } from "../lib/storyteller/sayParser";
import { getStoryteller, STORYTELLERS } from "../lib/storyteller/storytellers";
import { sessionLines } from "../lib/storyteller/recap";

const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "haiku" },
    storyteller: { type: "string", default: "eldrath" },
    bot: { type: "string" },
    persona: { type: "string" },
    script: { type: "string" },
    sessions: { type: "string", default: "1" },
    "compact-at": { type: "string" },
    out: { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

const OWNER = "playtest";
const USD = 1_000_000;
const BOT_MODEL = "claude-haiku-5-5";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local or the environment.");
  process.exit(1);
}
if (!MODEL_IDS.includes(args.model as ModelId)) {
  console.error(`--model must be one of ${MODEL_IDS.join(", ")}`);
  process.exit(1);
}
if (!STORYTELLERS.some((s) => s.id === args.storyteller)) {
  console.error(`--storyteller must be one of ${STORYTELLERS.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
if (args["compact-at"]) ENGINE_CONFIG.compactAtTokens = Number(args["compact-at"]);

const runId = args.out ?? `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${args.model}-${args.storyteller}`;
const outDir = join(".playtest", runId);
mkdirSync(outDir, { recursive: true });
const logPath = join(outDir, "log.jsonl");
const log = (kind: string, data: unknown) => appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), kind, data })}\n`);

/* ----------------------------------------------------------- recording */

interface CallLog {
  purpose: "turn" | "recap" | "compaction" | "bot";
  model: string;
  servedModel?: string;
  usage: Record<string, unknown>;
  costLines: CostLine[];
  providerMicros: number;
  ms: number;
  firstTextMs?: number;
  stopReason: string | null;
  content?: CallRecord["content"];
}
const calls: CallLog[] = [];
let currentTurnCalls: CallLog[] = [];
let recapPurpose: "recap" | "compaction" = "recap";

const real = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.PLAYTEST_BASE_URL ?? "https://api.anthropic.com",
  maxRetries: 3,
});

/** The engine's client, with every call timed, priced and logged. */
const client = {
  messages: {
    async parse(params: Parameters<typeof real.messages.parse>[0]) {
      const t0 = Date.now();
      const res = await real.messages.parse(params);
      const costLines = responseCost(params.model, res.usage);
      const c: CallLog = {
        purpose: recapPurpose,
        model: params.model,
        servedModel: res.model,
        usage: res.usage as unknown as Record<string, unknown>,
        costLines,
        providerMicros: sum(costLines),
        ms: Date.now() - t0,
        stopReason: res.stop_reason,
      };
      calls.push(c);
      log("call", { ...c, parsed: res.parsed_output });
      return res;
    },
  },
  beta: {
    messages: {
      stream(params: Parameters<typeof real.beta.messages.stream>[0], opts?: Parameters<typeof real.beta.messages.stream>[1]) {
        const t0 = Date.now();
        let firstTextMs: number | undefined;
        const s = real.beta.messages.stream(params, opts);
        s.on("text", () => (firstTextMs ??= Date.now() - t0));
        const finalMessage = s.finalMessage.bind(s);
        s.finalMessage = async () => {
          const m = await finalMessage();
          const costLines = responseCost(params.model, m.usage);
          const c: CallLog = {
            purpose: "turn",
            model: params.model,
            servedModel: m.model,
            usage: m.usage as unknown as Record<string, unknown>,
            costLines,
            providerMicros: sum(costLines),
            ms: Date.now() - t0,
            ...(firstTextMs !== undefined ? { firstTextMs } : {}),
            stopReason: m.stop_reason,
            content: m.content as CallRecord["content"],
          };
          calls.push(c);
          currentTurnCalls.push(c);
          log("call", c);
          return m;
        };
        return s;
      },
    },
  },
} as unknown as Anthropic;

const sum = (lines: CostLine[]) => lines.reduce((n, l) => n + l.micros, 0);

/* ---------------------------------------------------------------- game */

const mem = createMemoryStores({ [OWNER]: 1000 * USD });
const { stores } = mem;
let campaign: SaveFile;
let campaignId = "";

interface TurnLog {
  n: number;
  sessionNo: number;
  model: ModelId;
  input: string;
  calls: number;
  promptTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  uncached: number;
  providerMicros: number;
  chargedMicros: number;
  estimateMicros: number;
  ms: number;
  firstTextMs?: number;
  tools: string[];
  findings: Finding[];
}
const turns: TurnLog[] = [];
const notes: string[] = [];
let choices: string[] = [];
let pendingCheck: { label: string; notation: string; dc?: number } | null = null;
let modelId = args.model as ModelId;
let speakerOpen = "";

const color = (code: number) => (s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = color(2);
const cyan = color(36);
const yellow = color(33);
const red = color(31);
const green = color(32);

function onEvent(e: TableEvent) {
  log("event", e.type === "state" ? { type: "state", revision: e.save.revision } : e);
  if (args.quiet) return;
  switch (e.type) {
    case "speech": {
      const who = e.speaker === NARRATOR ? "" : e.speaker;
      if (who !== speakerOpen) {
        process.stdout.write(who ? `\n${cyan(`[${who}${e.mood ? `, ${e.mood}` : ""}]`)} ` : "\n");
        speakerOpen = who;
      }
      process.stdout.write(e.text);
      break;
    }
    case "speech.end":
      process.stdout.write("\n");
      speakerOpen = "";
      break;
    case "choices":
      choices = e.choices;
      console.log(yellow(e.choices.map((c, i) => `  /${i + 1} ${c}`).join("\n")));
      break;
    case "check":
      pendingCheck = { label: e.label, notation: e.notation, ...(e.dc !== undefined ? { dc: e.dc } : {}) };
      console.log(yellow(`  ⚂ ${e.label}: roll ${e.notation}${e.dc ? ` vs DC ${e.dc}` : ""}${e.advantage ? ` (${e.advantage})` : ""}  → /roll`));
      break;
    case "dice":
      console.log(dim(`  ⚂ ${e.by} rolled ${e.label}: ${e.roll.total}${e.outcome ? ` (${e.outcome})` : ""}`));
      break;
    case "cast":
      console.log(dim(`  ♪ ${e.npcId} → ${e.label}${e.generated ? " (generated)" : ""}`));
      break;
    case "image":
      console.log(dim(`  ▣ illustrate: ${e.asset.title}`));
      break;
    case "handout":
      console.log(dim(`  ✉ handout: ${e.asset.title}`));
      break;
    case "ambience":
      console.log(dim(`  ♫ ambience: ${e.mood}`));
      break;
    case "notice":
      console.log(green(`  ✔ ${e.message}`));
      break;
    case "error":
      console.log(red(`  ✖ ${e.code}: ${e.message}`));
      notes.push(`Error event: ${e.code}: ${e.message}`);
      break;
    case "done":
      break;
  }
}

async function play(line: string): Promise<boolean> {
  const t = line.trim();
  if (!t) return true;
  let input: TurnInput | null = null;
  if (t === "/quit") return false;
  if (t === "/state") {
    console.log(JSON.stringify(await loadCampaign(stores, OWNER, campaignId), null, 2));
    return true;
  }
  if (t === "/cost") {
    printCosts();
    return true;
  }
  if (t === "/end") {
    recapPurpose = "recap";
    const ended = await endSession(OWNER, campaignId, { stores, client, emit: onEvent });
    const save = await loadCampaign(stores, OWNER, campaignId);
    const r = save.memory.sessionRecaps[save.memory.sessionRecaps.length - 1];
    log("recap", r ?? null);
    console.log(green(ended && r ? `\n— Journal —\n${r.summary}\nLeft off: ${r.leftOff ?? ""}\nHooks: ${save.memory.nextSessionHooks.join(" | ")}\nQuotes: ${r.notableQuotes.join(" | ")}\n` : "No session to end."));
    if (ended && !r) notes.push("Session ended without a recap.");
    return true;
  }
  if (t === "/compact") {
    const s = await stores.sessions.latest(OWNER, campaignId);
    if (!s) return true;
    recapPurpose = "compaction";
    const ok = await compactSession(OWNER, campaignId, s, { stores, client, emit: onEvent });
    recapPurpose = "recap";
    const after = await stores.sessions.latest(OWNER, campaignId);
    log("compaction", { ok, carry: after?.carry, partNo: after?.partNo });
    console.log(green(ok ? `\n— Compacted into part ${after?.partNo} —\n${after?.carry?.summary}\nWhere it stopped: ${after?.carry?.leftOff}\n` : "Compaction failed."));
    return true;
  }
  const mm = /^\/model\s+(\w+)/.exec(t);
  if (mm) {
    if (!MODEL_IDS.includes(mm[1] as ModelId)) console.log(red(`Unknown model ${mm[1]}`));
    else {
      modelId = mm[1] as ModelId;
      await commitEvents(stores, OWNER, campaignId, [{ type: "campaign.model", modelId }], "user");
      console.log(green(`Model: ${getModel(modelId).name}`));
    }
    return true;
  }
  const choice = /^\/([1-4])$/.exec(t);
  if (choice) {
    const c = choices[Number(choice[1]) - 1];
    if (!c) {
      console.log(red("No such choice."));
      return true;
    }
    input = { type: "choice", text: c };
  } else if (t.startsWith("/roll")) {
    const notation = t.slice(5).trim() || pendingCheck?.notation || "d20";
    input = { type: "roll", notation, label: pendingCheck?.label ?? "Free roll" };
  } else if (t === "/begin") {
    input = { type: "begin" };
  } else if (t.startsWith("/")) {
    console.log(red(`Unknown command ${t}`));
    return true;
  } else {
    input = { type: "text", text: t };
  }
  await turn(input, t);
  return true;
}

async function turn(input: TurnInput, label: string) {
  const before = await loadCampaign(stores, OWNER, campaignId);
  const session0 = await stores.sessions.latest(OWNER, campaignId);
  const histLen = session0 && !session0.endedAt ? session0.messages.length : 0;
  const partBefore = session0?.partNo ?? 1;
  choices = [];
  if (input.type !== "begin") pendingCheck = null;
  currentTurnCalls = [];
  if (!args.quiet && input.type !== "begin") console.log(dim(`\n> ${label}`));
  log("input", input);
  const t0 = Date.now();
  let cost = 0;
  recapPurpose = "compaction"; // a recap/compaction call inside runTurn is compaction (or a recap of an idle session)
  await runTurn(OWNER, campaignId, input, {
    stores,
    client,
    emit: (e) => {
      if (e.type === "done") cost = e.turnCostMicros;
      onEvent(e);
    },
  });
  recapPurpose = "recap";
  const ms = Date.now() - t0;
  const save = await loadCampaign(stores, OWNER, campaignId);
  const session = await stores.sessions.latest(OWNER, campaignId);

  // Tool errors from the tool results added this turn.
  const toolErrors: string[] = [];
  const msgs = (session?.messages ?? []) as Array<{ role: string; content: Array<{ type: string; is_error?: boolean; content?: unknown }> }>;
  const fresh = (session?.partNo ?? 1) === partBefore ? msgs.slice(histLen) : [];
  for (const m of fresh) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === "tool_result" && b.is_error) toolErrors.push(String(b.content));
  }
  if ((session?.partNo ?? 1) !== partBefore) {
    console.log(green(`  ✔ Compacted after this turn → part ${session?.partNo}`));
    log("compaction", { auto: true, carry: session?.carry, partNo: session?.partNo });
    notes.push(`Auto-compaction after turn ${turns.length + 1} (part ${session?.partNo}). Carry: ${session?.carry?.leftOff}`);
  }

  const tc = currentTurnCalls;
  const usageNum = (c: CallLog, k: string) => Number(c.usage[k] ?? 0);
  const findings = auditTurn(
    tc.map((c) => ({ content: c.content ?? [], stopReason: c.stopReason })),
    before,
    save,
    toolErrors,
  );
  for (const c of tc) if (c.servedModel && !c.servedModel.startsWith(c.model)) findings.push({ severity: "info", code: "model.fallback", detail: `asked ${c.model}, served ${c.servedModel}` });
  const last = tc[tc.length - 1];
  const tl: TurnLog = {
    n: turns.length + 1,
    sessionNo: session?.sessionNo ?? 0,
    model: modelId,
    input: label,
    calls: tc.length,
    promptTokens: last ? usageNum(last, "input_tokens") + usageNum(last, "cache_read_input_tokens") + usageNum(last, "cache_creation_input_tokens") : 0,
    outputTokens: tc.reduce((n, c) => n + usageNum(c, "output_tokens"), 0),
    cacheRead: tc.reduce((n, c) => n + usageNum(c, "cache_read_input_tokens"), 0),
    cacheWrite: tc.reduce((n, c) => n + usageNum(c, "cache_creation_input_tokens"), 0),
    uncached: tc.reduce((n, c) => n + usageNum(c, "input_tokens"), 0),
    providerMicros: tc.reduce((n, c) => n + c.providerMicros, 0),
    chargedMicros: cost,
    estimateMicros: typicalTurnMicros(getModel(modelId).apiModel),
    ms,
    ...(tc[0]?.firstTextMs !== undefined ? { firstTextMs: tc[0].firstTextMs } : {}),
    tools: tc.flatMap((c) => (c.content ?? []).filter((b) => b.type === "tool_use").map((b) => b.name ?? "?")),
    findings,
  };
  turns.push(tl);
  log("turn", tl);
  if (!args.quiet) {
    console.log(
      dim(
        `  [${tl.calls} call${tl.calls === 1 ? "" : "s"} · ${tl.promptTokens.toLocaleString()} tok prompt · ${tl.outputTokens} out · ${formatUsd(Math.round(tl.providerMicros))} cost / ${formatUsd(tl.chargedMicros)} charged (est ${formatUsd(tl.estimateMicros)}) · ${(ms / 1000).toFixed(1)}s${tl.firstTextMs ? `, first text ${(tl.firstTextMs / 1000).toFixed(1)}s` : ""}]`,
      ),
    );
    if (tl.tools.length) console.log(dim(`  tools: ${tl.tools.join(", ")}`));
    for (const f of findings) console.log((f.severity === "error" ? red : yellow)(`  ! ${f.code}: ${f.detail}`));
  }
  campaign = save;
}

/* ----------------------------------------------------------------- bot */

const DEFAULT_PERSONA =
  "You are playtesting a solo tabletop RPG as the player. Play a curious, slightly reckless character. Make real choices, talk to characters, try clever or risky things, and sometimes do something unexpected. Keep each message to one or two sentences, in first person, like a real player typing.";

async function botMove(): Promise<string> {
  if (pendingCheck) return "/roll";
  const session = await stores.sessions.latest(OWNER, campaignId);
  const save = await loadCampaign(stores, OWNER, campaignId);
  const names = new Map(save.npcs.map((n) => [n.id, n.name]));
  const lines = session && !session.endedAt ? sessionLines(session).slice(-30) : [];
  const transcript = lines
    .map((l) => (l.kind === "player" ? `You: ${l.text}` : l.kind === "dice" ? `[Roll] ${l.text}` : l.kind === "npc" ? `${names.get(l.speaker) ?? l.speaker}: ${l.text}` : `Storyteller: ${l.text}`))
    .join("\n");
  if (choices.length && Math.random() < 0.4) return `/${1 + Math.floor(Math.random() * choices.length)}`;
  const t0 = Date.now();
  const res = await real.messages.create({
    model: BOT_MODEL,
    max_tokens: 300,
    output_config: { effort: "low" },
    system: `${args.persona ?? DEFAULT_PERSONA} Reply with only what you say or do as the player, no quotes or narration of the outcome.`,
    messages: [{ role: "user", content: `${transcript || "(The game is starting.)"}${choices.length ? `\n\nOffered choices: ${choices.join(" | ")}` : ""}\n\nYour move:` }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const costLines = responseCost(BOT_MODEL, res.usage);
  calls.push({ purpose: "bot", model: BOT_MODEL, usage: res.usage as unknown as Record<string, unknown>, costLines, providerMicros: sum(costLines), ms: Date.now() - t0, stopReason: res.stop_reason });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return text.replace(/^["“]|["”]$/g, "").slice(0, 600) || "I look around.";
}

/* -------------------------------------------------------------- report */

function stats(xs: number[]) {
  if (!xs.length) return { avg: 0, p50: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, p50: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
}

function printCosts() {
  const by = new Map<string, { n: number; micros: number }>();
  for (const c of calls) {
    const k = `${c.purpose}:${c.model}`;
    const v = by.get(k) ?? { n: 0, micros: 0 };
    by.set(k, { n: v.n + 1, micros: v.micros + c.providerMicros });
  }
  for (const [k, v] of Array.from(by)) console.log(`  ${k}: ${v.n} calls, ${formatUsd(Math.round(v.micros))}`);
}

function report(): string {
  const real = turns.filter((t) => t.calls > 0);
  const cost = stats(real.map((t) => t.providerMicros));
  const charged = stats(real.map((t) => t.chargedMicros));
  const lat = stats(real.map((t) => t.ms));
  const ftt = stats(real.filter((t) => t.firstTextMs).map((t) => t.firstTextMs!));
  const prompt = stats(real.map((t) => t.promptTokens));
  const callsPer = stats(real.map((t) => t.calls));
  const out = stats(real.map((t) => t.outputTokens));
  const cacheHit = real.reduce((n, t) => n + t.cacheRead, 0) / Math.max(1, real.reduce((n, t) => n + t.cacheRead + t.cacheWrite + t.uncached, 0));
  const est = real[0]?.estimateMicros ?? typicalTurnMicros(getModel(modelId).apiModel);
  const findingCounts = new Map<string, number>();
  for (const t of turns) for (const f of t.findings) findingCounts.set(`${f.severity} ${f.code}`, (findingCounts.get(`${f.severity} ${f.code}`) ?? 0) + 1);
  const toolCounts = new Map<string, number>();
  for (const t of turns) for (const n of t.tools) toolCounts.set(n, (toolCounts.get(n) ?? 0) + 1);
  const side = calls.filter((c) => c.purpose === "recap" || c.purpose === "compaction");
  const bot = calls.filter((c) => c.purpose === "bot");
  const u = (m: number) => formatUsd(Math.round(m));
  const st = getStoryteller(args.storyteller!);

  return `# Playtest ${runId}

- Model: ${getModel(args.model).name}${modelId !== args.model ? ` (switched to ${getModel(modelId).name})` : ""} · storyteller: ${st.name}
- Turns: ${real.length} · sessions: ${Math.max(0, ...turns.map((t) => t.sessionNo))} · compactAtTokens: ${ENGINE_CONFIG.compactAtTokens.toLocaleString()}

## Cost per turn (provider cost, before the ${Math.round(MARKUP * 100)}% markup)

| | avg | median | max |
|---|---|---|---|
| Real provider cost | ${u(cost.avg)} | ${u(cost.p50)} | ${u(cost.max)} |
| Charged (cost + markup) | ${u(charged.avg)} | ${u(charged.p50)} | ${u(charged.max)} |
| Estimate shown to players (\`typicalTurnMicros\`, incl. markup) | ${u(est)} | | |
| Calls per turn | ${callsPer.avg.toFixed(2)} | ${callsPer.p50} | ${callsPer.max} |
| Prompt tokens (last call) | ${Math.round(prompt.avg).toLocaleString()} | ${prompt.p50.toLocaleString()} | ${prompt.max.toLocaleString()} |
| Output tokens per turn | ${Math.round(out.avg)} | ${out.p50} | ${out.max} |
| Turn time | ${(lat.avg / 1000).toFixed(1)}s | ${(lat.p50 / 1000).toFixed(1)}s | ${(lat.max / 1000).toFixed(1)}s |
| Time to first text | ${(ftt.avg / 1000).toFixed(1)}s | ${(ftt.p50 / 1000).toFixed(1)}s | ${(ftt.max / 1000).toFixed(1)}s |

- Cache hit rate (cache reads / all prompt tokens): ${(cacheHit * 100).toFixed(0)}%
- Real charged ÷ estimate: ${(charged.avg / Math.max(1, est)).toFixed(2)}×
- Recap + compaction calls: ${side.length}, ${u(side.reduce((n, c) => n + c.providerMicros, 0))}
- Bot player calls (not billed to players): ${bot.length}, ${u(bot.reduce((n, c) => n + c.providerMicros, 0))}

## Tool use

${Array.from(toolCounts).sort((a, b) => b[1] - a[1]).map(([n, c]) => `- ${n}: ${c}`).join("\n") || "- none"}

## Findings

${Array.from(findingCounts).sort((a, b) => b[1] - a[1]).map(([k, c]) => `- ${k}: ${c}`).join("\n") || "- none"}

${turns.filter((t) => t.findings.length).map((t) => `- Turn ${t.n} (\`${t.input.slice(0, 50)}\`): ${t.findings.map((f) => `${f.code} (${f.detail})`).join("; ")}`).join("\n")}

## Notes

${notes.map((n) => `- ${n}`).join("\n") || "- none"}

## Per turn

| # | s | input | calls | prompt | out | cost | charged | time | tools |
|---|---|---|---|---|---|---|---|---|---|
${turns.map((t) => `| ${t.n} | ${t.sessionNo} | ${t.input.slice(0, 40).replace(/\|/g, "/")} | ${t.calls} | ${t.promptTokens} | ${t.outputTokens} | ${u(t.providerMicros)} | ${u(t.chargedMicros)} | ${(t.ms / 1000).toFixed(1)}s | ${t.tools.join(", ")} |`).join("\n")}
`;
}

async function finish() {
  const save: SaveFile = await loadCampaign(stores, OWNER, campaignId);
  writeFileSync(join(outDir, "save.json"), JSON.stringify(save, null, 2));
  const session = await stores.sessions.latest(OWNER, campaignId);
  if (session) writeFileSync(join(outDir, "transcript.json"), JSON.stringify(sessionLines(session), null, 2));
  writeFileSync(join(outDir, "report.md"), report());
  console.log(`\nReport: ${join(outDir, "report.md")}`);
}

/* ---------------------------------------------------------------- main */

async function main() {
  campaign = await createCampaign(stores, OWNER, { title: "Playtest", storytellerId: args.storyteller!, modelId: args.model as ModelId });
  campaignId = campaign.campaignId;
  const sessionsWanted = Math.max(1, Number(args.sessions));
  try {
    await turn({ type: "begin" }, "/begin");
    if (args.script) {
      const lines = readFileSync(args.script, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
      for (const l of lines) if (!(await play(l))) break;
    } else if (args.bot) {
      const n = Number(args.bot);
      for (let s = 1; s <= sessionsWanted; s++) {
        for (let i = 0; i < n; i++) {
          const move = await botMove();
          if (!(await play(move))) break;
        }
        if (s < sessionsWanted) {
          await play("/end");
          await turn({ type: "begin" }, "/begin");
        }
      }
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      for (;;) {
        const line = await rl.question(`\n${green(">")} `).catch(() => "/quit");
        if (!(await play(line))) break;
      }
      rl.close();
    }
  } finally {
    await finish();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
