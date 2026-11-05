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
```

In a game, type a line to act, `/1`–`/4` to pick a choice, `/roll` to roll the pending check, `/end` to end the session and write the journal, `/compact` to compact now, `/model opus` to switch, `/state` for the save file, `/cost` for spend so far, `/quit` to stop.

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

## Results

No real runs recorded yet. Run the harbor script on all three models and paste the cost tables here, next to `typicalTurnMicros`, before changing `lib/billing/pricing.ts` or the prompt.
