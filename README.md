# DyD - Dungeons & Dragons Management Platform

## ✨ Overview

DyD is a modern web platform to manage Dungeons & Dragons (D&D) campaigns and other roleplaying sessions. It allows players and Game Masters to track characters, mechanics, quests, NPCs, preferences, and world states, while integrating AI support via Vapi and generating session reports in PDF.

Access the platform at: **[https://www.dreampool.ai/](https://www.dreampool.ai/)**

## 🚀 Technologies Used
- **Framework:** Next.js (API Routes)
- **Database:** MongoDB + Mongoose
- **Authentication:** Clerk
- **AI Integration:** Vapi AI (via tool calls)
- **PDF Generation & Storage:** pdf-lib + Trieve
- **Payments:** Stripe

---

## 📡 API Endpoints Reference
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

### `/api/sessionData` & `/api/sessions`
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

## 🔊 Voice Agent Integration (`/api/vapi/...`)
These endpoints are used exclusively by the voice agent (Vapi) through tool calls.

### `/api/vapi/campaignName`
Update the campaign name for a given session.

### `/api/vapi/character`
Create or update character information (name, class, abilities, equipment, etc.).

### `/api/vapi/mechanicsTraking`
Record or modify mechanical gameplay data like combat or rules.

### `/api/vapi/npcsRelations`
Add or edit NPCs and their relation state.

### `/api/vapi/pdfData`
Generate a session report PDF and update the linked Vapi Knowledge Base via Trieve.

### `/api/vapi/playerPreferences`
Set or enhance narrative preferences like tone, pace, or boundaries.

### `/api/vapi/quest`
Append or revise quests in the current session.

### `/api/vapi/worldState`
Track changes to locations, factions, environment, and time.

---

## 🧠 Notes
- All endpoints are protected by Clerk.
- MongoDB models are indexed by `userId` or `sessionId`.
- Session data integrates with Vapi AI via tool-based webhooks.
- Reports are generated as PDFs and stored via Trieve, then synced with Vapi KBs.

---

## 🗂 Future Enhancements
- Admin dashboards for campaign oversight
- Multiplayer & DM role management
- Session analytics
- Unit + integration testing coverage
- Centralized documentation under `/docs`

---

For developers: refer to `models/` and `lib/` folders for detailed logic and implementation.

