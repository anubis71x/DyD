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
| `STRIPE_SECRET_KEY` | Stripe |
| `ANTHROPIC_API_KEY` | Claude API key for the storyteller |

The old `NEXT_PUBLIC_VAPI_*` and `TRIEVE_*` variables are no longer used and can be deleted.

Players choose the storyteller's model per campaign and can switch during play: Claude Haiku 5.5 (default, 1 coin per turn), Sonnet 5.5 (2) or Opus 5.5 (3). Models, effort levels and coin prices are set in `lib/storyteller/models.ts`. Each play session records token usage per model (`playsessions.usage`), so prices can be checked against real costs.

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
- Coin balances change only on the server. The browser can no longer set them.

---

## 🗂 Future Enhancements
- Admin dashboards for campaign oversight
- Multiplayer & DM role management
- Session analytics
- Unit + integration testing coverage
- Centralized documentation under `/docs`

---

For developers: refer to `models/` and `lib/` folders for detailed logic and implementation.

