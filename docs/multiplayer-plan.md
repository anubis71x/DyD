# Multiplayer Plan: Playing Together

Status: **Draft for review** · Date: 2026-11-05 · Builds on `docs/modernization-plan.md`

## 1. Goal

Two to five players share one campaign at the same table, in real time, with one storyteller. Each player has their own character. Players can join by invite link, drop in and out between sessions, and play with voice and text together, as in solo play. Solo play stays exactly as it is.

**Out of scope for the first version:** public matchmaking, spectators, more than five players, players controlling the same character, and asynchronous "play-by-post" campaigns.

## 2. Recommended order

**Build voice first, then multiplayer.** Voice brings LiveKit, which gives us the two hard parts of multiplayer for free:

- **Rooms with presence**: who is at the table right now.
- **A live channel to every player's screen**: data messages for story text, dice and save-file changes. Vercel functions can't hold open connections, so without LiveKit we'd need a separate real-time service (Ably, Pusher) and then replace it.

With voice, each player's microphone is a separate audio track, so the storyteller always knows who said what, without guessing speakers from mixed audio.

If multiplayer is wanted sooner, a **text-only** version can use LiveKit data channels alone (no audio), and voice joins later on the same rooms.

## 3. What changes

### 3.1 Save file: from one character to a party

Save file v2 replaces `character` with a party. Everything else (quests, NPCs, world, memory) stays shared.

```ts
SaveFileV2 = {
  ...SaveFileV1 without `character`,
  schemaVersion: 2,
  party: {
    playerId: string,            // Clerk user id
    displayName: string,         // shown at the table
    role: "host" | "player",
    joinedAt: ISODate,
    character: Character,        // today's character shape
    preferences?: { contentBoundaries: string[] }, // private, merged for the storyteller
  }[],
}
```

- **Migration v1 → v2** is mechanical: the owner becomes the host, and their character moves into `party[0]`. Solo campaigns are just parties of one, so there's one code path.
- **Events** gain a target: `character.update`, `character.resource`, `inventory.*` take a `playerId`. Tools get a `player` argument (the character's name or id), validated against the party.
- **Ownership:** `ownerId` (the host) controls the campaign. A `members` list on the campaign record grants access. Every store method keeps filtering by user, now "owner or member".

### 3.2 Turns: gathering, spotlight and initiative

The design question that matters most. Three modes, chosen by the storyteller as the scene demands:

| Mode | When | How it works |
|---|---|---|
| **Open table** (default) | Exploration, conversation | Messages are gathered for a short window (about 3 s after the last message, at most 10 s), then sent together as one user turn: `<player name="Aria">…</player><player name="Bram">…</player>`. Typing indicators show that someone is still writing. |
| **Spotlight** | One player's moment | The storyteller calls `spotlight({ player })`; others can still type, but their messages wait until the spotlight ends. |
| **Initiative** | Combat | `start_initiative()` rolls on the server and sets an order; the UI shows whose turn it is; each player acts in order; `end_initiative()` returns to the open table. |

Prompt changes: the storyteller addresses players by character name, rotates the spotlight so nobody is left out, and never decides what any player's character says or feels. A `request_roll` names the player who rolls; only that player's dice button lights up.

### 3.3 Real-time table

- **One LiveKit room per campaign session.** The server (the storyteller agent) joins the room and publishes the same `TableEvent`s we stream today (`speech`, `state`, `dice`, `choices`, …) as data messages. Players publish their inputs.
- **Joining mid-session:** a late player loads the save file and the current session's transcript over HTTP (as today), then subscribes to the room.
- **Reconnects:** events carry a sequence number; a client that missed some re-fetches the transcript.
- **Turn lock:** the existing campaign lock already serializes storyteller turns across servers.

### 3.4 Invites and roles

- **Invite links:** the host creates a link (`/join/<token>`, expires in 7 days, can be revoked). Joining asks for a display name and starts character creation with the storyteller.
- **Roles:** the host can kick players, end sessions, change the model and delete the campaign. Players can play, roll and leave.
- **Leaving:** a player who leaves keeps a copy of their character (export) and their character is marked "absent" in the save. The storyteller writes them out of scenes gracefully.

### 3.5 Billing

Turns cost a bit more with a party (the storyteller tracks more), still cents per hour on Haiku. Options:

| Option | How | Trade-off |
|---|---|---|
| **Host pays** *(recommended for v1)* | Every turn is charged to the host's balance. | Simplest, matches "I'm running a game for friends". Friends can play without topping up. |
| Split per turn | Each gathered turn is charged across the players who acted in it. | Fairer for groups of strangers, but more ledger entries and "who's out of funds" problems mid-scene. |
| Each pays own turns | Like split, but by who sent the message. | Players who talk more pay more, which feels odd at a table. |

Recommendation: **host pays** for v1. If someone else runs out of funds nothing happens; if the host does, the table pauses with an "Add funds" prompt for the host. Revisit split billing if public tables ever exist.

### 3.6 Safety

- **Content boundaries are merged across the party; the strictest wins.** Each player's boundaries stay private (other players don't see them); the storyteller sees the merged list.
- A player can privately ask to skip a scene ("X-card"), which sends a private notice to the storyteller to steer away without naming who asked.
- The host can kick a player; kicked players lose access immediately.

### 3.7 Voice (when it exists)

- Each player's microphone is its own track; speech-to-text runs per track, so lines arrive already attributed.
- Gathering uses voice activity: the window closes when everyone has been quiet briefly.
- Barge-in: any player can interrupt the storyteller.
- Every seat is voice and text together; players who mute audio or their mic still read and type along.

## 4. UI

- **Party panel** (replaces the single "Hero" drawer): every character at a glance, HP bars, who's online, who's typing.
- **Turn indicator:** open table, spotlight on Aria, or the initiative order with the current player highlighted.
- **Player lines** in the feed show the character's portrait and name; your own lines are right-aligned as today.
- **Dice:** a check shows who rolls; only that player's button is active; everyone sees the result.
- **Lobby:** the campaign page shows party members, invite link, and "Start session".

## 5. Milestones

| # | Scope | Size |
|---|---|---|
| M1 | Save file v2 (party), migration, tools and prompt with a `player` argument, membership checks. Solo still works as a party of one. | Medium |
| M2 | Invite links, join flow, roles, party panel, lobby. Still one player at a time acting (no real-time yet). | Medium |
| M3 | Real-time table on LiveKit data channels: live feed for everyone, presence, typing, gathering window, reconnects. | Large |
| M4 | Spotlight and initiative modes, per-player dice checks, merged content boundaries, private X-card. | Medium |
| M5 | Host-pays billing with "table paused" handling; per-session usage per player in the billing report. | Small |
| M6 | Voice tables: per-player tracks and STT, barge-in from any player. (Requires the voice pipeline.) | Medium |

M1 can start before voice: it's a data model change with no real-time parts, and it makes the rest straightforward.

## 6. Open decisions

1. **Billing:** host pays (recommended), split per turn, or each pays their own.
2. **Party size cap:** 4 or 5.
3. **Text multiplayer before voice?** (Needs LiveKit Cloud either way; LiveKit's free tier covers development.)
4. **Late joiners:** can players join a session in progress, or only between sessions?
