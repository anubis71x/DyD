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
- **Storytellers become config, not Vapi assistants.** See §2.4. This replaces `VapiAgent`, the hard-coded list in `ServerGrid.tsx` and the `/api/agents/sync` job.
- **LLM.** Use a fast model for the live turn loop (e.g. `claude-sonnet-5-5`) and a cheaper model (e.g. `claude-haiku-5-5`) for background jobs like summarizing and compacting state. Put the persona, the rules and the current save snapshot in a cached system-prompt prefix so each turn stays cheap and fast.
- **Latency target:** under 800 ms from end of user speech to first audio. Stream STT partials, stream LLM tokens into TTS sentence by sentence, and start TTS on the first clause.
- **Multilingual:** the current first message offers English, Español and 日本語. Pick STT and TTS models with multilingual support, and store `language` in player preferences so the pipeline can switch STT language hints.

### 2.2 Lessons from an earlier prototype

We already have a working voice-roleplay prototype: Python/FastAPI, Claude for replies, ElevenLabs for both STT and TTS, server-side VAD, and replies split into sentences that stream to TTS over SSE. That confirms the cascaded design and the vendor pair. What to carry over and what to change:

| Prototype behavior | Keep / change for DyD |
|---|---|
| Claude reply split into sentences, each streamed to TTS | **Keep.** This is the main latency trick, and it works. |
| ElevenLabs voices | **Keep** as the default TTS vendor. Voice quality is already proven. |
| `cast.json` maps each speaker to a voice ID | **Keep and extend.** NPCs can get their own voices, not just the narrator. Have the LLM tag each speaker's lines (e.g. `<npc id="...">`), and route each span to that speaker's voice. Store `voiceId` on each NPC in the save file. |
| Story presets + reusable characters included with `{{id}}` | **Keep the idea.** It becomes narrator personas and campaign templates, plus a reusable NPC library. Expand `{{id}}` server-side, as the prototype does. |
| Browser `MediaRecorder` uploads WebM chunks on a timer, then batch STT | **Change.** Use continuous audio over WebRTC with streaming STT. Timeslice chunking is the main cause of the prototype's uneven input latency. |
| Server-side VAD with silence threshold + padding | **Keep the approach**, but add a semantic end-of-turn model (LiveKit's turn detector) so short pauses mid-thought don't trigger a reply. |
| User input is queued while the assistant is speaking | **Change to barge-in.** If the player speaks, stop TTS, keep the part of the reply already spoken in history, and drop the rest. |
| MP3 chunks played through an `<audio>` element | **Replace.** Send PCM frames over WebRTC, so we don't have to manage gaps between chunks on the client. |
| Session state only in the prompt / `localStorage` | **Replace** with the save file (§3). |

Because the prototype is Python, its `cascade_engine` logic could carry over if we chose LiveKit Agents for **Python** instead of Node. See open decision 7.

### 2.3 Tools run server-side, bound to the session

Game tools (`update_character`, `add_quest`, `update_quest_status`, `upsert_npc`, `log_world_event`, `record_mechanic`, `set_preferences`, `rename_campaign`, plus the casting and table tools `cast_voice`, `roll_dice`, `offer_choices`, `illustrate`, `show_handout`, `set_ambience`) run **inside the agent process**:

- `campaignId` and `userId` come from the signed LiveKit token metadata. **The model never supplies IDs.** This fixes problems 2 and 4 by design.
- Each tool's input is a Zod schema. The same schema produces the JSON Schema we send to the LLM, so there is one source of truth.
- Tools return the updated slice of state so the model sees what actually changed.

### 2.4 Storytellers and the voice cast

Today a narrator *is* a voice. Picking Eldrath means everything is spoken in Eldrath's voice. The new model keeps two things separate:

- A **Storyteller** is *who runs the game*: personality, narrative style, pacing, humor, rules strictness, and a **signature narration voice**. This is what the player picks.
- The **Voice Library** is *who can speak*: a catalog of voices the storyteller can cast at any moment for NPCs, monsters, crowds, a letter read aloud, or a flashback.

```ts
Storyteller = {
  id, name, tagline, portraitUrl, accentColor,
  personaPrompt,                 // style, tone, house rules
  narrationVoiceId,              // always used for narration
  styleTags: string[],           // "grim", "whimsical", "tactical", "cozy"…
  languages: string[],
  sampleAudioUrl,                // pre-rendered "hear me" clip for the picker
  castingPrefs?: { avoidVoiceIds?: string[]; preferTags?: string[] }
}

Voice = {
  id, provider: "elevenlabs" | "local" | …, providerVoiceId,
  label, tags: string[],         // gender, age, accent, timbre, "creature", "child", "ethereal"…
  languages: string[], sampleAudioUrl,
  styleRange?: { emotions: string[] }   // what this voice can do convincingly
}
```

**How the storyteller casts voices mid-story:**

1. **Tagged output.** Untagged text is narration and uses the storyteller's voice. Character speech is wrapped as `<say who="npc_id" mood="wary">…</say>`. The agent parses the tags *as the stream arrives* and sends each span to TTS with the right voice and style settings. Sentence-level streaming still works.
2. **Casting tool.** When a new NPC appears, the model calls `cast_voice({ npcId, description })`, e.g. "ancient dragon, slow, cavernous". The **CastingService** picks the best match from the library by tags and language, skipping voices already used in this scene. It writes `npc.voiceId` into the save file, so that NPC sounds the same in every later session.
3. **Custom voices (optional, gated).** If nothing in the library fits (a choir of ghosts, a talking sword), the casting service can generate a voice from the description using the TTS vendor's voice-design API, or apply effects (pitch, reverb, layering) to a library voice. Generated voices are cached per campaign. Cap how many each campaign can make, since they cost money.
4. **Player override.** In the NPC roster, players can tap an NPC and say "recast this voice". This fires the same tool from the UI.

Guardrails: a fixed narration voice keeps the storyteller recognizable; set a limit on distinct voices per scene (e.g. 6) so scenes stay clear; fall back to the narration voice with a style change if TTS for a cast voice fails.

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
  storytellerId: string,
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
             motivations?, lastInteraction?, memorableLines: string[],
             voiceId?: string, portraitAssetId?: string }[],
  world:   { currentLocation?, locations: { name, discovered: boolean, notes? }[],
             factions: { name, standing: number, notes? }[], timeline: string[], inGameTime? },
  mechanics: { system: string, houseRules: string[], recentChecks: string[] /* capped */ },
  preferences: { language, gameStyle, tone, pacing, interactionStyle, contentBoundaries: string[] },

  memory: {
    storySoFar: string,                   // rolling summary, rewritten by background job
    sessionRecaps: { sessionNo, date, summary, notableQuotes: string[] }[],
    nextSessionHooks: string[]
  },

  assets: { id, kind: "image"|"handout"|"map", url, prompt?, subject?: { type: "npc"|"location"|"scene", id } }[],
  generatedVoices: { voiceId, description, createdAt }[]   // campaign-scoped custom voices (§2.4)
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

## 4. Interface and visual refresh

### 4.1 What's there now
- Two narrators hard-coded in `ServerGrid.tsx`, shown as emoji cards with a fake "players" count. Choosing one opens a page that is just a Siri waveform and a call button (`components/siri.tsx`).
- Flat dark cards (`#1A1A20`), amber accents, Inter everywhere, and AdSense loaded on every dashboard page, including during play.
- "Create character" is a disabled button. During a call, you can't see your character, quests or NPCs. Everything is audio only.
- The dashboard headline is "Dungeons & Dragons". That's a Wizards of the Coast trademark, so we shouldn't use it as branding. Brand as **Dreampool**. If we want D&D-style rules, describe them as "compatible with 5e rules" using the SRD, which is licensed CC-BY.

### 4.2 Visual direction
- **Look:** modern dark fantasy. Deep ink backgrounds, softly lit surfaces, and one accent color per storyteller that tints the whole table. A display serif for headings (e.g. Fraunces or Cormorant) and Inter for UI text. Large portrait art in place of emoji.
- **System:** move to Tailwind v4 design tokens (color, radius, elevation, motion) on top of the shadcn/ui components we already use, and remove the duplicate `tailwind.config.js`. Every screen uses the same tokens, with light mode as an option.
- **Motion:** framer-motion, kept subtle: panels slide in, the speaker portrait glows while that voice talks, and dice roll physically. Respect `prefers-reduced-motion`.
- **Presence:** replace the Siri waveform with an audio-reactive "presence" orb or portrait for the storyteller. It reacts to the voice that is speaking and shifts color when a cast NPC talks.
- **Mobile first:** voice play mostly happens on phones. Side panels become bottom sheets, and controls stay within reach of a thumb.
- **No ads at the table.** If we keep ads, show them only on the library and store pages.

### 4.3 Information architecture
```
Landing  →  Library (your campaigns / save slots, "Continue" hero card with last recap)
         →  New Campaign wizard:  1. Choose storyteller  2. Choose world/template  3. Create character (form or talk it through)
         →  Story Table (the play screen)
         →  Settings (voice/text mode, language, content boundaries, audio levels)   ·   Store (coins)
```

**Storyteller picker:** a gallery of large portrait cards showing the tagline, style tags, languages and a ▶ **Hear a sample** button (uses `sampleAudioUrl`). Players can preview and switch before starting. Data comes from the `Storyteller` records (§2.4), not code.

### 4.4 The Story Table: more than audio

Clickable mockup: [`docs/mockups/story-table.html`](mockups/story-table.html) (open it in a browser). It shows the storyteller picker, the voice input panel, and the scene art and dice side panel.
The play screen is a multi-panel table. The voice session and the screen stay in sync through **LiveKit data-channel events** sent by the agent:

| Panel / feature | What it does | Driven by |
|---|---|---|
| **Story feed** (center) | A live transcript shown as styled prose. Each speaker gets a portrait and color; narration and dialogue look different; the line being spoken is highlighted. Players can scroll back. | Transcript + `<say>` speaker tags |
| **Input modes** | Open mic, push-to-talk, or **text only**. Text is quiet, accessible, and cheaper: we can skip TTS and read along. Players can switch mid-session. | Client setting; agent accepts text turns |
| **Suggested actions** | 2–4 tappable choice chips after key beats ("Bribe the guard", "Draw your blade"), plus "something else". | `ui.choices` tool |
| **Dice** | Animated dice. The roll is done **on the server** (no client-side faking), and the storyteller narrates the result. Players can also roll themselves. | `roll_dice` tool → `ui.dice` |
| **Character sheet** | Stats, HP and resources (with bars), inventory, abilities. Updates live when tools change them, and changed fields flash briefly. | `state.patch` events from `SaveService` |
| **Quest log** | Active and completed quests, with objectives you can check off. | same |
| **NPC roster** | Portraits, disposition, last interaction, and **voice** (tap to replay a line or recast the voice). | same + `cast_voice` |
| **Scene art** | Illustrations of locations, NPC portraits and key moments, generated in the background and saved to `assets[]`. They fade in as the backdrop. | `illustrate` tool → image worker → `ui.image` |
| **Handouts & map** | Letters, wanted posters and riddles appear as cards the storyteller can read aloud. A simple node map shows discovered locations. | `show_handout`, world state |
| **Ambience** | Optional background music and sound effects chosen by scene mood (tavern, storm, dungeon), ducked under speech. | `set_ambience` tool, licensed audio library |
| **Recap & save** | "Previously on…" card at session start; end-of-session recap; save file view and `.dydsave` export. | §3.4 |

Event contract (agent → client): `{ type: "state.patch" | "ui.choices" | "ui.dice" | "ui.image" | "ui.handout" | "ui.ambience" | "speaker", payload, seq }`. Client → agent: `{ type: "text.turn" | "choice.pick" | "dice.roll" | "npc.recast" }`. Every event goes through the same server-side tools, so voice, taps and typed text all change the save file the same way.

---

## 5. Billing and auth fixes (do these regardless of the rewrite)
- Remove client-side writes to `availablePoints`. Add a `coin_ledger` collection (`{ userId, delta, reason, refId }`) and compute the balance from it.
- The agent meters actual connected seconds and debits periodically on the server. It ends the call cleanly when the balance hits zero. Stripe webhook credits go through the same ledger.
- `middleware.ts`: stop marking all of `/api` public. Only the Stripe webhook (signature-verified) should be public.
- Rename secrets: no private key gets a `NEXT_PUBLIC_` prefix.

---

## 6. Phased rollout

### Progress (2026-11-04)
Vapi is removed and voice play is paused. Text play runs on the new stack:
- **Phase 0:** done, by removal. `/api/vapi/*`, Trieve and the shared dataset are gone; `/api` requires sign-in; coins can no longer be set from the browser. Stripe still credits coins before payment (tracked as a separate task).
- **Phase 1:** done. `lib/save/` (schema, reducer, event log, Mongo + in-memory stores, `.dydsave` export/import) and `scripts/migrate-legacy.ts`.
- **Phase 2:** text half done. `lib/storyteller/` runs Claude with the game tools, `<say>` speaker tags, voice casting from the library and server-side dice. LiveKit, STT and TTS are not started yet.
- **Phase 3:** partly done. Library + storyteller picker at `/dashboard/narrator`, Story Table at `/dashboard/play/[id]` (text input, choices, dice, scene, character/quest/cast/map drawers).
- Not yet: session-end recaps (the `memory.recap` event exists, nothing writes it), an image provider, ambience audio, voice.


| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Hotfixes** (can ship now on the Vapi stack) | Lock down `/api/vapi/*` with a shared secret header; fix `sessionData` owner filter; server-side coin debit; split Trieve datasets per user or disable KB import | No cross-user reads/writes possible |
| **1. Save service** | Zod `SaveFileV1`, `SaveService` (load/apply event/export/import), migration script from 6 collections → `campaigns` | All existing sessions converted; round-trip export/import test passes |
| **2. Agent MVP** | LiveKit room + Node agent worker, one storyteller, STT→Claude→TTS, `<say>` parsing + `cast_voice` with a starter voice library (~20 tagged voices), game tools wired to `SaveService`, token endpoint in Next | Internal playtest: <800 ms median turn latency; NPC voices stay consistent across calls |
| **2b. Design system** (parallel with 2) | Tokens, type, color, motion; restyle shell, Library, storyteller picker with samples; remove ads from play | Design review sign-off; Lighthouse a11y ≥ 95 |
| **3. Story Table** | Replace `use-Vapi.ts` with `useStorySession` (LiveKit React); story feed, text/voice/push-to-talk modes, character sheet, quest log, NPC roster, dice, suggested actions; data-channel event contract | Feature parity + new panels behind a feature flag |
| **3b. Rich media** | Scene art worker + `assets[]`, handouts, location map, ambience; optional custom voices | Playtest: panels judged helpful, not distracting |
| **4. Memory & recaps** | Background summarizer, session recaps, "previously on…" opener, save-file viewer + `.dydsave` download/upload, optional PDF export | Returning-player playtests rate continuity ≥ current |
| **5. Cutover & cleanup** | Flag on for all users; delete Vapi, Trieve, `VapiAgent`, `/api/vapi/*`, old collections (after backup) | Vapi/Trieve bills at zero |
| **6. Platform upgrade** (parallel-safe) | Next 15+, React 19, Clerk `clerkMiddleware`, drop duplicate `tailwind.config.js` | Build + lint clean |

Phase 0 is small and independent. Since problem 1 leaks user data, I'd ship it first even if the rest of the plan changes.

---

## 7. Open decisions

1. **Hosting for the agent worker**: Fly.io / Railway / AWS? (Must support long-lived processes; region close to LiveKit + users.)
2. **LiveKit Cloud vs self-hosted** at launch (recommend Cloud first, self-host once usage justifies it).
3. **STT/TTS vendors**: confirm voice quality per narrator and per language; budget per minute decides this.
4. **Transcript retention**: store full transcripts (better recaps, privacy cost) or only summaries?
5. **Multiple saves per user**: the current UI assumes one session per user (`data[0]`). The new model supports many campaigns. Do we want campaign slots in the UI?
6. **Database**: stay on Mongo (recommended for now) or move to Postgres + jsonb + pgvector during the rewrite.
7. **Agent language**: Node/TS (one language with the Next app; recommended) or Python (reuses the prototype's engine code; LiveKit Agents supports both).
8. **Truly local TTS**: the prototype is cloud TTS (ElevenLabs). If a self-hosted voice model is a goal for cost or privacy, plan for a GPU worker behind the same TTS interface. Treat it as a later swap, not a launch requirement.
9. **Image generation provider** for scene art and portraits (Claude doesn't generate images). Choose on style consistency, cost per image, and content policy. We need one consistent art style per campaign.
10. **Custom voice generation**: allowed for every user, a paid extra, or turned off at launch?
11. **Branding**: fully rename to Dreampool and support any rules system, or keep a 5e flavor using the SRD?
12. **Ambience library**: licensed packs vs generated audio.
