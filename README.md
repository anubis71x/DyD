# DyD - Dungeons & Dragons Management Platform

## ✨ Overview

DyD (Dreampool) is a solo tabletop roleplaying app. The player picks a storyteller, and an AI storyteller runs the game: it narrates, voices the characters, rolls dice and keeps a structured save file of the character, quests, characters met and the world.

> **Status:** Vapi has been removed. Voice play is paused for maintenance while the new voice pipeline is built (see `docs/modernization-plan.md`). Every campaign can be played by text in the meantime.

Access the platform at: **[https://www.dreampool.ai/](https://www.dreampool.ai/)**

## 🚀 Technologies Used
- **Framework:** Next.js (API Routes)
- **Database:** MongoDB + Mongoose
- **Authentication:** Clerk
- **Storyteller:** Claude via the Anthropic SDK (`lib/storyteller/`), with server-side game tools
- **Save files:** one versioned JSON document per campaign plus an event log (`lib/save/`), portable as `.dydsave`
- **Payments:** Stripe

## 🛠 Running locally

```bash
yarn install
yarn dev
```

Environment (`.env.local`):

| Variable | Purpose |
|---|---|
| `MONGODB_URL` | MongoDB connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk auth |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the Stripe webhook endpoint (see Billing) |
| `CRON_SECRET` | Shared secret for the scheduled idle-session job (see Sessions) |
| `ANTHROPIC_API_KEY` | Claude API key for the storyteller |

The old `NEXT_PUBLIC_VAPI_*` and `TRIEVE_*` variables are no longer used and can be deleted.

Players choose the storyteller's model per campaign and can switch during play: Claude Haiku 5.5 (default), Sonnet 5.5 or Opus 5.5. Models and effort levels are set in `lib/storyteller/models.ts`.

## 📖 Sessions, compaction and recaps

- **Everything saves as it happens.** The save file (character, quests, characters met, world) is updated the moment the storyteller changes it. The player's message is stored before the model is called, every reply is stored as soon as it completes, and a reply cut off mid-stream is kept and marked as interrupted. A dice roll is kept even if the turn fails, so it can't be re-rolled.
- **Long sessions are compacted, not split.** When the prompt the API reports passes ~60K tokens, the history is summarized (Claude Haiku 5.5) right after that turn and play continues in a fresh *part* of the same session, from the summary plus exactly where the scene stopped. This keeps turns fast and every prompt under Haiku's 100K-token price step. The feed still shows the whole session.
- **One journal entry per session**, written when it really ends: the player's End session button, or 6 hours without activity. It covers every part.
- **Abandoned sessions** are closed by a scheduled job, so returning players always get a "previously on…". Call it every 30-60 minutes, either as an HTTP cron (Vercel Cron sends the header automatically when `CRON_SECRET` is set):
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/close-sessions
  ```
  or as a script on a self-hosted server:
  ```bash
  yarn sessions:close-idle
  ```
- **Hosting note:** a turn keeps running if the player's browser disconnects, and compaction runs after the reply has been sent. On a long-running Node server this works as is. On serverless hosts, make sure functions aren't stopped when the client disconnects (e.g. Vercel's `waitUntil`); if one is stopped, everything up to the last completed step is still saved and an unfinished compaction is retried on the next turn.

## 💳 Billing

Players keep a prepaid dollar balance and pay what each turn actually costs us, plus a markup.

- **Charging:** after every turn, the API's reported token usage is priced with the rate table in `lib/billing/pricing.ts` (including fallback models and Haiku's long-prompt rates) and charged at cost + 30% (`MARKUP`). Before a turn starts, a worst-case amount is held so a turn can't run on an empty balance; the unused part is released when the turn settles.
- **Ledger:** every grant, top-up, hold, release and charge is a row in the `ledger` collection with a unique reference, so nothing is applied twice. `wallets` holds the current balance as a cache of the ledger.
- **Top-ups:** $5 minimum (presets $5 / $10 / $20 / $50, up to $500). The balance is credited only by the Stripe webhook after Stripe confirms the payment.
- **New players** get $2.50 of free credit once.
- **Recaps and compactions** run on Claude Haiku 5.5 and are charged the same way (typically a fraction of a cent).
- **Each completed model call is charged as it finishes**, so a crash later in the turn can't lose a charge.
- **Safety:** a hold left by a crashed turn is released automatically after 15 minutes.

Setup and operations:

1. In the Stripe dashboard, add a webhook endpoint for `https://<your-domain>/api/stripe/webhook` with the `payment_intent.succeeded` event, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
2. Convert legacy coin balances once (dry run first). Coins convert at the $10 pack price, $10 / 60 ≈ $0.1667 each:
   ```bash
   yarn billing:convert-coins
   yarn billing:convert-coins --apply
   ```
3. Monthly: `yarn billing report --month=YYYY-MM` shows top-ups, charges, provider cost and margin per model. Compare the provider cost with the Anthropic Console's usage page; a gap means `pricing.ts` needs new rates. `yarn billing reconcile` checks balances against the ledger (`--fix` corrects them).

Checks: `yarn test` (unit tests), `yarn typecheck`, `yarn lint`.

### Migrating legacy sessions

Old campaigns live in six per-session collections. Convert them into save files once:

```bash
yarn migrate:legacy          # dry run
yarn migrate:legacy --apply  # write campaigns
```

It is safe to re-run: converted sessions are marked and skipped. Legacy collections are left in place until you delete them.

## 🎲 Storyteller API

All routes require a signed-in Clerk user, and every read or write is scoped to that user.

| Route | Purpose |
|---|---|
| `GET /api/campaigns` | List your campaigns and coin balance |
| `POST /api/campaigns` | Start a campaign `{ storytellerId, modelId? }` |
| `GET /api/campaigns/[id]` | Save file plus the current session's transcript |
| `PATCH /api/campaigns/[id]` | Switch the storyteller's model `{ modelId }` |
| `DELETE /api/campaigns/[id]` | Delete a campaign |
| `POST /api/campaigns/[id]/session/end` | End the current session and write its recap |
| `GET /api/cron/close-sessions` | Scheduled job: close idle sessions (needs `Authorization: Bearer $CRON_SECRET`) |
| `POST /api/campaigns/[id]/turn` | Play a turn (`begin`, `text`, `choice` or `roll`); streams table events as server-sent events |
| `GET /api/campaigns/[id]/export` | Download the `.dydsave` file |
| `POST /api/campaigns/import` | Upload a `.dydsave` file (raw body) |

---

## 📡 API Endpoints Reference (legacy)
All routes require authentication (`Clerk userId`) unless stated otherwise. All data is sent and received in JSON format.

### `/api/characters`
Create, update, fetch, and delete characters linked to a session.

### `/api/collections` & `/api/collections/[collectionId]`
Create, retrieve, update and delete collections and their associated products.

### `/api/orders` & `/api/orders/[orderId]` & `/api/orders/customers/[customerId]`
Manage order data and summaries, linked to customer records.

### `/api/mechanicsTracking`
CRUD operations for tracking combat, rules, and player mechanics.

### `/api/npcsRelations`
Manage relationships and dialogue history with NPCs per session.

### `/api/playerPreferences`
Store player tone, pacing, and boundary preferences for narrative balance.

### `/api/products` & `/api/products/[productId]` & `/api/products/[productId]/related`
Full product catalog support with rich filtering, editing, and linkage to collections.

### `/api/quests`
Track quest status, goals, NPCs, and narrative objectives.

### `/api/search/[query]`
Fuzzy search over product titles, tags, and categories.

### `/api/sessions`
Full session lifecycle management with aggregate data access.

### `/api/stripe`
Create checkout sessions and award points.

### `/api/token`
Track and update coin transactions per user.

### `/api/user`
Initialize or update user profile and point balance.

### `/api/worldState`
Track world evolution including locations, factions, events, and time flow.

---

## 🧠 Notes
- All API endpoints require a Clerk session (`middleware.ts`).
- The routes listed under "API Endpoints Reference" are the legacy per-session models. They are kept until the migration has run and will then be removed.
- Balances change only on the server, through the ledger. The browser can't set them.

---

## 🗂 Future Enhancements
- Admin dashboards for campaign oversight
- Multiplayer & DM role management
- Session analytics
- Unit + integration testing coverage
- Centralized documentation under `/docs`

---

For developers: refer to `models/` and `lib/` folders for detailed logic and implementation.

