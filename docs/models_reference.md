# 📦 Full API Models & Example Payloads

This document lists **all expected inputs and responses** for every endpoint in the DyD platform, including standard API routes and voice agent (Vapi) tool integrations. It is designed for copy-paste usage and development reference.

---

## `/api/characters`
### POST / PUT
```json
{
  "sessionId": "<session_id>",
  "name": "Aria Nightshade",
  "classRole": "Rogue",
  "keyAttributes": { "DEX": 18, "INT": 14 },
  "resources": { "HP": 32, "Stamina": 10 },
  "notableAbilities": ["Sneak Attack"],
  "equipment": ["Dagger", "Cloak of Invisibility"],
  "characterGoals": ["Retrieve the cursed gem"]
}
```
### Response:
```json
{ "_id": "<id>", ...fields }
```

---

## `/api/collections`
### POST
```json
{
  "title": "Winter Gear",
  "description": "All products for snowy terrain.",
  "image": "https://cdn.com/winter.jpg"
}
```
### Response: returns the created collection with `_id`

---

## `/api/collections/[collectionId]`
### POST (Update)
```json
{
  "title": "Winter Gear Updated",
  "description": "Updated winter wear.",
  "image": "https://cdn.com/updated.jpg"
}
```

---

## `/api/orders`
### GET → No body required
### Response:
```json
[
  {
    "_id": "...",
    "customer": "John Doe",
    "products": 3,
    "totalAmount": 150,
    "createdAt": "Apr 10, 2025"
  }
]
```

---

## `/api/orders/customers/[customerId]`
### GET → No body required
### Response: List of customer orders with full product population

---

## `/api/orders/[orderId]`
### GET → No body required
### Response:
```json
{
  "orderDetails": { /* order info */ },
  "customer": { /* customer data */ }
}
```

---

## `/api/mechanicsTracking`
### POST / PUT
```json
{
  "sessionId": "<session_id>",
  "systemRules": ["Variant flanking rule"],
  "resourcesUsedGained": { "Mana": -5 },
  "combatEncounters": ["Troll cave"],
  "skillChecks": ["Stealth DC14"],
  "customRulesApplied": ["No critical fails"]
}
```

---

## `/api/npcsRelations`
### POST
```json
{
  "sessionId": "<session_id>",
  "npcs": [
    {
      "name": "Thorn", "relationship": "hostile",
      "description": "Bandit leader",
      "lastInteraction": "Ambush at forest",
      "motivations": "Gold",
      "dialogues": ["You'll regret this!"]
    }
  ]
}
```

---

## `/api/playerPreferences`
### POST
```json
{
  "sessionId": "<session_id>",
  "gameStyle": "Strategic",
  "toneAtmosphere": "Dark Fantasy",
  "contentBoundaries": ["No gore"],
  "pacingPreferences": "Fast",
  "interactionStyle": "Improvised"
}
```

---

## `/api/products`
### POST
```json
{
  "title": "Magic Cloak",
  "description": "Increases stealth.",
  "media": ["https://img.com/cloak.png"],
  "category": "Armor",
  "collections": ["<collection_id>"],
  "tags": ["stealth"],
  "sizes": ["S", "M"],
  "colors": ["Black"],
  "price": 100,
  "expense": 60
}
```

---

## `/api/products/[productId]/related`
### GET → Returns related products based on category or collections

---

## `/api/quests`
### POST
```json
{
  "sessionId": "<session_id>",
  "quests": [
    {
      "title": "Rescue the Merchant",
      "description": "Trapped in goblin camp.",
      "status": "active",
      "relatedNPCs": ["Lana"],
      "objectives": ["Find camp", "Free merchant"]
    }
  ]
}
```

---

## `/api/worldState`
### POST
```json
{
  "sessionId": "<session_id>",
  "locationsVisited": ["Goblin Caves"],
  "newLocationsDiscovered": ["Sunken Temple"],
  "factionChanges": ["Bandits now neutral"],
  "environmentalChanges": ["Forest blighted"],
  "timeProgression": "3 days later"
}
```

---

## `/api/pdf`
### POST
```json
{
  "pdfData": {
    "sessionSummary": "Summary text",
    "characterInfo": [],
    "questLog": [],
    "narrativeDevelopment": "...",
    "worldDetails": {},
    "npcDetails": [],
    "mechanicsTracking": {},
    "nextSessionPlan": "..."
  }
}
```
### Response:
```json
{
  "url": "https://trieve.ai/viewer/pdf/<file_id>"
}
```

---

## `/api/sessionData`
### GET
Requires query param: `sessionId=<id>`
Returns full data structure:
```json
{
  "sessionId": "...",
  "session": { ... },
  "character": { ... },
  "mechanicsTracking": { ... },
  "npcsRelations": { ... },
  "quests": { ... },
  "worldState": { ... },
  "playerPreferences": { ... }
}
```

---

## `/api/sessions`
### POST
```json
{
  "campaign": "New Campaign"
}
```

---

## `/api/stripe`
### POST
```json
{
  "amount": 1000,
  "currency": "usd"
}
```

---

## `/api/token`
### POST
```json
{
  "userId": "user_x",
  "coins": 500,
  "usdValue": 10
}
```

---

## `/api/user`
### PUT
```json
{
  "availablePoints": 6000,
  "isNewUser": false
}
```

---

## `/api/vapi/*` TOOL ENDPOINTS
- `/vapi/campaignName` → `{ uId, sessionId, campaign }`
- `/vapi/character` → `{ sessionId, character: {...} }`
- `/vapi/mechanicsTraking` → `{ sessionId, mechanicsTracking: {...} }`
- `/vapi/npcsRelations` → `{ sessionId, npcs: [...] }`
- `/vapi/pdfData` → `{ sessionId, pdfData: {...} }`
- `/vapi/playerPreferences` → `{ sessionId, playerPreferences: {...} }`
- `/vapi/quest` → `{ sessionId, quests: [...] }`
- `/vapi/worldState` → `{ sessionId, worldState: {...} }`

---

✅ All routes have been included. You may now export or extend this documentation per module.

