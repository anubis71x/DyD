# Playtesting the storyteller

`yarn play` runs the real storyteller engine (`lib/storyteller/engine.ts`) against the Claude API in the terminal, with in-memory stores: no database, no sign-in, no wallet. Every model call is timed and priced with `lib/billing/pricing.ts`, and every turn is checked by `lib/playtest/audit.ts`.

Needs `ANTHROPIC_API_KEY` (environment or `.env.local`). Requests go to `https://api.anthropic.com`; set `PLAYTEST_BASE_URL` to use another endpoint. `ANTHROPIC_BASE_URL` is ignored on purpose.

```bash
yarn play                                         # interactive, Haiku 5.5, Eldrath
yarn play --model sonnet --storyteller lyra
yarn play --script scripts/playtests/harbor.txt --model opus   # same inputs on every model
yarn play --bot 12 --model haiku                  # a Haiku "player" plays 12 turns
yarn play --bot 8 --sessions 2                    # end the session, check the recap and the next opener
yarn play --bot 20 --compact-at 12000             # force compaction early
yarn play --bot 10 --length rich                  # reply length: brief | standard | rich
```

In a game, type a line to act, `/1`–`/4` to pick a choice, `/roll` to roll the pending check, `/end` to end the session and write the journal, `/compact` to compact now, `/model opus` to switch, `/length rich` to change the reply length, `/state` for the save file, `/cost` for spend so far, `/quit` to stop.

Each run writes `.playtest/<run>/`:

- `report.md`: real cost per turn next to the estimate players are shown (`typicalTurnMicros`), cache hit rate, calls and tokens per turn, latency and time to first text, tool counts and audit findings per turn.
- `log.jsonl`: every table event and every API call (usage, served model, content).
- `save.json`, `transcript.json`: the save file and visible story at the end.

## What the audit flags

| Code | Meaning |
|---|---|
| `say.unknown_speaker` | A `<say who>` id that isn't in the cast, so TTS has no voice for it |
| `say.no_voice` / `cast.missing` | A character spoke, or was added, without `cast_voice` |
| `say.untagged_dialogue` | Quoted speech in narration (read in the narrator's voice) |
| `say.nested`, `say.unbalanced`, `say.no_who`, `tag.unexpected` | Broken markup |
| `say.player_voiced` | The storyteller spoke as the player |
| `style.markdown`, `style.emoji`, `style.long` | Bad for read-aloud |
| `dice.invented` | Narration states a roll result without a dice tool |
| `roll.kept_talking`, `roll.multiple` | Kept narrating after `request_roll`, or asked for several rolls |
| `tool.error` | A tool call failed validation |
| `model.fallback` | The API served a different model (refusal fallback) |

These are heuristics: read the flagged lines before changing the prompt.

## Results (2026-11-05)

Five rounds on Haiku 5.5, Sonnet 5.5 and Opus 5.5: the harbor script (12–13 turns, two sessions) and a 30-turn bot game per round (two sessions, compaction forced at 14K tokens), across all four storytellers. About $5 of API calls in all.

### Cost per turn, final round (provider cost; players pay +30%)

| Model | Real cost | Charged | Shown to players before | Shown now | Calls/turn | Turn time |
|---|---|---|---|---|---|---|
| Haiku 5.5 | $0.0006 | $0.0008 | $0.0019 | $0.0010 | 1.4 | 4.0 s |
| Sonnet 5.5 | $0.0093 | $0.0120 | $0.0341 | $0.0166 | 1.6 | 5.3 s |
| Opus 5.5 | $0.0214 | $0.0278 | $0.0681 | $0.0331 | 1.5 | 7.5 s |

- The old estimate (`typicalTurnMicros`) was about 2–3x the real charge. It assumed 600 output and 1,500 cache-write tokens per call. Real calls average 190–350 output tokens, 400–700 cache-write tokens, ~9K cache reads and almost no uncached input; the prompt cache hit rate is 92–96%.
- The new estimate assumes a 15K-token prompt (larger than measured, to allow for long sessions before compaction at 60K) and 300 output tokens per call. It sits 1.2–1.4x above the real charge. The landing page's "free turns" figure uses it, so it rose too; it is still below what the signup credit really buys.
- `holdMicros` (the amount reserved before a turn) is still about 10x the worst real turn. That is safe, but a player needs roughly $0.50 available to start an Opus turn even though turns cost about 3 cents. Worth loosening later.
- Time to first text was 1.5–2.5 s on every model, well above the 800 ms voice target in the modernization plan. Haiku at medium effort is not faster to first text than Sonnet or Opus at low effort.
- A recap or compaction call (Haiku) costs about $0.0006–0.0008.

### What the playtests found, and what changed

| Problem (round 1) | Fix | Final round |
|---|---|---|
| `update_npc` rejected updates to known characters without a name (every model) | `name` optional when `id` is given | 0 errors |
| Haiku wrote ambience moods over 60 characters, which were rejected | Clip instead of reject; ask for 1–4 words | 0 errors |
| After `offer_choices`, the engine called the model again: Haiku repeated the whole reply word for word (read aloud twice), Sonnet/Opus often added nothing | Engine ends the turn at `offer_choices` once narration was heard; otherwise the tool result asks for the full reply | 0 repeats; 5–40% fewer calls per turn |
| Opus (4 of 13 turns) and Sonnet called tools silently and ended the turn with no narration | Prompt: narrate first, then tools in the same message; never end on tools only | 1 empty turn in 115 |
| Session 2 sometimes opened with one line ("What do you do, Wren?") and no "previously" | Same two fixes | All six session-2 openers have a recap and a scene |
| Characters spoke without a voice when models skipped `cast_voice` | `update_npc` casts a voice for every new character (optional `voice` field; falls back to the description) | 0 voiceless speakers; `cast_voice` now only for recasts |
| Sonnet/Opus replies ran 9–16 sentences | Prompt: two to five sentences, about 40–90 words including dialogue | Long replies 0–4 per run, down from 1–6 |
| Quoted dialogue left in narration (read in the narrator's voice) | Prompt: report a passing character's words instead of quoting them | Still 1–2 per Sonnet bot game |

Speaker tags were used correctly from the start: every `<say who>` id matched a cast character, with no nesting or broken tags. The final round had two `say.unknown_speaker` findings (an id that wasn't in the cast), not yet investigated.

Recaps and compaction worked on every model: each run wrote one journal entry per session, compaction ran 1–3 times per bot game, and play continued from the carry-over without a greeting or recap.

### Reply length (added after these rounds)

Players now choose Brief, Standard or Rich replies on the play screen (default Standard), or ask for it in the game. The system prompt describes all three levels; the engine sends a one-line `<table_settings>` note at the start of each session or part and whenever the setting changes, so the prompt cache isn't disturbed. The audit's `style.long` limit follows the setting (80 / 160 / 320 words).

The same change brought in the strongest parts of the old Vapi prompt: asking for a game style and dice preference before the first scene, danger matched to the style (no unearned deaths), an encounter checklist (goal, intentions, terrain, timer, reward, readable way out, a mid-encounter shift), letting characters talk in conversations, five-senses description, no flattery from strangers, and generous handling of speech-recognition errors.

None of this has been playtested yet: the API account ran out of credit. Before shipping, run the harbor script on each model at `--length brief` and `--length rich`, and compare cost per turn with Standard (the Rich hint says it costs a little more).

### Still open

- Sonnet occasionally quotes a minor character in narration, and Opus once used an emoji. Both are rare.
- First-text latency (see above) matters once voice returns.
- Run `yarn play --bot 60` on each model with the default `compactAtTokens` to measure cost at real session lengths.
