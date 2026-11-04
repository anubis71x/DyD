# DyD Modernization Plan: Own Voice Pipeline + Structured Save Files

Status: **Draft for review** · Date: 2026-11-04

## 1. Where we are today

| Concern | Current implementation | Files |
|---|---|---|
| Voice / LLM | Vapi hosted assistants (`@vapi-ai/web`), one assistant per "narrator" | `hooks/use-Vapi.ts`, `app/api/agents/*`, `lib/models/VapiAgent.ts` |
| Game-state writes | Vapi tool calls POST to `/api/vapi/*`; the LLM passes `sessionId` / `uId` as arguments | `app/api/vapi/*/route.ts` |
| Game state | 6 separate Mongo collections keyed by `sessionId` (Character, Quest, NpcsRelations, WorldState, MechanicsTracking, PlayerPreferences) | `lib/models/*` |
| "Save file" / memory | `updatePdfData` tool → render a PDF with pdf-lib → delete old file and upload new one to Trieve → create/patch a Vapi Knowledge Base on that dataset | `app/api/vapi/pdfData/route.ts`, `lib/generateSessionPDF.ts`, `lib/trieve.ts` |
| Context at call start | Client fetches `/api/sessionData`, stuffs it into `context` JSON for Vapi | `hooks/use-Vapi.ts` |
| Billing | Coins (`User.availablePoints`) decremented **from the client** via `PUT /api/user` | `components/coin.meter.tsx`, `app/api/user/route.ts` |
| Stack | Next 14.1, Clerk v4 `authMiddleware`, Mongoose 8, React 18 | `package.json`, `middleware.ts` |

### Problems the rewrite needs to fix

These are real issues in the current code, not just style:

1. **Save data can leak between users.** Every PDF is uploaded to a single Trieve dataset (`TRIEVE_DATASET` env var). Each session's Vapi KB is then created with `providerId: <dataset_id>`, which imports the *whole dataset*. So any user's narrator can retrieve other users' session reports.
2. **Tool endpoints have no auth.** `middleware.ts` makes `/api/:path*` public, and the `/api/vapi/*` routes don't verify a Vapi signature or secret. Anyone who knows (or guesses) a `sessionId` can overwrite that session's character, quests, etc. Because the model supplies the IDs, a prompt injection can also make it write to the wrong session.
3. **Users can set their own coin balance.** `PUT /api/user` accepts any `availablePoints` value from the browser.
4. **`/api/sessionData` likely never matches.** It filters on `userId`, but `Session` stores the owner as `uId` and the child models have no user field. Unknown filter fields go straight to Mongo (Mongoose 8 `strictQuery: false`), so the query returns nothing and the route returns 404. That would explain why returning players often lose context.
5. **Vector retrieval is the wrong tool for structured state.** The data is small and structured (a character sheet, a quest list, NPCs). Flattening it to a PDF, chunking it, and fetching it back by similarity loses information and adds latency. The delete-then-upload step also leaves a window where no save exists.
6. Secrets are named `NEXT_PUBLIC_VAPI_PRIVATE_KEY`. The `NEXT_PUBLIC_` prefix means Next.js will put it in the client bundle as soon as any client file references it.

---

## 2. Target architecture

```
 Browser (Next.js app)
   │  WebRTC audio (LiveKit client SDK)          REST / server actions
   ▼                                                    ▼
 LiveKit room  ◀──────────────▶  Narrator Agent worker (Node/TS, long-lived)
                                   ├─ VAD + turn detection (barge-in)
                                   ├─ STT  (streaming, e.g. Deepgram)
                                   ├─ LLM  (Claude, tool use, prompt caching)
                                   ├─ TTS  (streaming, e.g. ElevenLabs / Cartesia)
                                   └─ Game tools ──▶ SaveService ──▶ DB
                                                        │
 Next.js API (auth via Clerk) ──────────────────────────┘
   - mint LiveKit token bound to {userId, campaignId}
   - list/load/export/import saves
   - server-side metering / coin ledger
```

### 2.1 Voice pipeline

**Recommendation: LiveKit (transport) + LiveKit Agents for Node (orchestration), with our own choice of STT, LLM and TTS providers.**

- This gives us "our own pipeline": we own the prompts, the tools, the state and the provider choices. LiveKit handles WebRTC, echo cancellation, jitter and reconnects, which are hard to get right and add nothing to the game. It's open source, so we can start on LiveKit Cloud and self-host later.
- Alternatives considered:
  - **Pipecat** (Python). Comparable, but it would split the codebase into two languages.
  - **Raw WebSocket + our own VAD.** Most control, but we'd have to build barge-in, echo handling and mobile network recovery ourselves.
  - **Speech-to-speech realtime models.** Lowest latency, but they lock us into one vendor's voices and make it harder to keep each narrator's voice distinct.
- **The agent can't run on Vercel serverless functions** (long-lived process, persistent connections). Deploy it as a separate container on Fly.io, Railway, Render or ECS. The Next.js app can stay where it is.

Pipeline details:
- **Narrators become config, not Vapi assistants.** A `Narrator` record holds `{ id, name, persona prompt, voice provider + voiceId, language defaults, LLM params }`. This replaces `VapiAgent` and the `/api/agents/sync` job.
- **LLM.** Use a fast model for the live turn loop (e.g. `claude-sonnet-5-5`) and a cheaper model (e.g. `claude-haiku-5-5`) for background jobs like summarizing and compacting state. Put the persona, the rules and the current save snapshot in a cached system-prompt prefix so each turn stays cheap and fast.
- **Latency target:** under 800 ms from end of user speech to first audio. Stream STT partials, stream LLM tokens into TTS sentence by sentence, and start TTS on the first clause.
- **Multilingual:** the current first message offers English, Español and 日本語. Pick STT and TTS models with multilingual support, and store `language` in player preferences so the pipeline can switch STT language hints.

### 2.2 Tools run server-side, bound to the session

Game tools (`update_character`, `add_quest`, `update_quest_status`, `upsert_npc`, `log_world_event`, `record_mechanic`, `set_preferences`, `rename_campaign`) run **inside the agent process**:

- `campaignId` and `userId` come from the signed LiveKit token metadata. **The model never supplies IDs.** This fixes problems 2 and 4 by design.
- Each tool's input is a Zod schema. The same schema produces the JSON Schema we send to the LLM, so there is one source of truth.
- Tools return the updated slice of state so the model sees what actually changed.

---

## 3. Save file format

### 3.1 Principles
- **One versioned JSON document per campaign** replaces the six collections and the PDF. It's small (usually under 50 KB), so the agent loads the whole thing into context with no retrieval step.
- **Event log + snapshot.** Every tool call adds a typed event to that campaign's event log. The snapshot is the result of applying all events in order. This gives an audit trail, undo / "rewind to last session", and safe concurrent writes.
- **Explicit `schemaVersion`** with forward migrations in code (`migrations/v1_to_v2.ts`, …).
- **Portable.** Users can export and import a `.dydsave` file (gzipped JSON with a checksum). The PDF becomes an optional *rendered export*, generated from the save on demand.

### 3.2 Schema (v1)

```ts
// lib/save/schema.ts  (Zod, abbreviated)
SaveFileV1 = {
  schemaVersion: 1,
  campaignId: string,          // ulid
  ownerId: string,             // Clerk userId
  title: string,
  narratorId: string,
  createdAt: ISODate, updatedAt: ISODate,
  revision: number,            // increments on every applied event (optimistic concurrency)

  character: {
    name, classRole, level?, attributes: Record<string, number>,
    resources: Record<string, { current: number; max?: number }>,
    abilities: string[], inventory: { name: string; qty: number; notes?: string }[],
    goals: string[], backstory?: string
  },
  quests:  { id, title, description, status: "active"|"completed"|"failed",
             objectives: { text: string; done: boolean }[], relatedNpcIds: string[] }[],
  npcs:    { id, name, description, disposition: "friendly"|"neutral"|"hostile",
             motivations?, lastInteraction?, memorableLines: string[] }[],
  world:   { currentLocation?, locations: { name, discovered: boolean, notes? }[],
             factions: { name, standing: number, notes? }[], timeline: string[], inGameTime? },
  mechanics: { system: string, houseRules: string[], recentChecks: string[] /* capped */ },
  preferences: { language, gameStyle, tone, pacing, interactionStyle, contentBoundaries: string[] },

  memory: {
    storySoFar: string,                   // rolling summary, rewritten by background job
    sessionRecaps: { sessionNo, date, summary, notableQuotes: string[] }[],
    nextSessionHooks: string[]
  }
}
```

### 3.3 Storage
- **Keep MongoDB for now** (least migration work). New collections:
  - `campaigns`: the snapshot document plus `ownerId`, `revision` and indexes.
  - `campaign_events`: `{ campaignId, seq, type, payload, at, source: "tool"|"user"|"system" }`.
  - `transcripts`: per-session turns, kept for recaps. Set a TTL or let users opt in to keeping them.
- Writes are `findOneAndUpdate({ _id, ownerId, revision })` and bump `revision`. A conflict means re-reading and re-applying the event.
- **Every query filters on `ownerId`.** Put this in one `SaveService`, so no route queries the collections directly.
- **Optional, later:** if users want "remember that thing from 10 sessions ago", add per-campaign embeddings of transcripts using Atlas Vector Search or pgvector, **always filtered by `campaignId`**. This is only for recall. The save file stays the source of truth.

### 3.4 Memory lifecycle
1. **Session start:** load the snapshot, render it into a compact prompt block, and start the call. The first line comes from `memory.nextSessionHooks` and the character, replacing the hard-coded `firstMessage` strings.
2. **During the session:** tool calls emit events, and the snapshot updates live.
3. **Session end (or every N turns):** a background job sends the transcript and the event diff to the cheaper model. It writes `sessionRecaps[]` and `nextSessionHooks`, and rewrites `storySoFar` to stay under a token budget.

---

## 4. Billing and auth fixes (do these regardless of the rewrite)
- Remove client-side writes to `availablePoints`. Add a `coin_ledger` collection (`{ userId, delta, reason, refId }`) and compute the balance from it.
- The agent meters actual connected seconds and debits periodically on the server. It ends the call cleanly when the balance hits zero. Stripe webhook credits go through the same ledger.
- `middleware.ts`: stop marking all of `/api` public. Only the Stripe webhook (signature-verified) should be public.
- Rename secrets: no private key gets a `NEXT_PUBLIC_` prefix.

---

## 5. Phased rollout

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Hotfixes** (can ship now on the Vapi stack) | Lock down `/api/vapi/*` with a shared secret header; fix `sessionData` owner filter; server-side coin debit; split Trieve datasets per user or disable KB import | No cross-user reads/writes possible |
| **1. Save service** | Zod `SaveFileV1`, `SaveService` (load/apply event/export/import), migration script from 6 collections → `campaigns` | All existing sessions converted; round-trip export/import test passes |
| **2. Agent MVP** | LiveKit room + Node agent worker, one narrator, STT→Claude→TTS, game tools wired to `SaveService`, token endpoint in Next | Internal playtest: <800 ms median turn latency, state persists across calls |
| **3. Client swap** | Replace `use-Vapi.ts` with `useNarratorSession` (LiveKit React components), live transcript, volume visualizer (keep siriwave), narrator picker reads `Narrator` config | Feature parity with current UI behind a feature flag |
| **4. Memory & recaps** | Background summarizer, session recaps, "previously on…" opener, save-file viewer + `.dydsave` download/upload, optional PDF export | Returning-player playtests rate continuity ≥ current |
| **5. Cutover & cleanup** | Flag on for all users; delete Vapi, Trieve, `VapiAgent`, `/api/vapi/*`, old collections (after backup) | Vapi/Trieve bills at zero |
| **6. Platform upgrade** (parallel-safe) | Next 15+, React 19, Clerk `clerkMiddleware`, drop duplicate `tailwind.config.js` | Build + lint clean |

Phase 0 is small and independent. Since problem 1 leaks user data, I'd ship it first even if the rest of the plan changes.

---

## 6. Open decisions

1. **Hosting for the agent worker**: Fly.io / Railway / AWS? (Must support long-lived processes; region close to LiveKit + users.)
2. **LiveKit Cloud vs self-hosted** at launch (recommend Cloud first, self-host once usage justifies it).
3. **STT/TTS vendors**: confirm voice quality per narrator and per language; budget per minute decides this.
4. **Transcript retention**: store full transcripts (better recaps, privacy cost) or only summaries?
5. **Multiple saves per user**: the current UI assumes one session per user (`data[0]`). The new model supports many campaigns. Do we want campaign slots in the UI?
6. **Database**: stay on Mongo (recommended for now) or move to Postgres + jsonb + pgvector during the rewrite.
