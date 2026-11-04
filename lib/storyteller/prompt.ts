import type { SaveFile } from "@/lib/save/schema";
import type { Storyteller } from "./storytellers";
import { voiceLabel } from "./voices";

/**
 * The system prompt depends only on the storyteller, so it is identical on
 * every request for that storyteller and caches well. Anything that changes
 * (the save file, the session number) goes into the conversation instead.
 */
export function buildSystemPrompt(st: Storyteller): string {
  return `${st.persona}

You are running a solo tabletop roleplaying game for one player on Dreampool, an app that reads your replies aloud and shows them on screen beside a character sheet, quest log, cast list, scene art and a dice tray. The player speaks or types; you narrate, voice the characters, and run the rules (5e-compatible, based on the SRD).

How to write each reply
- Replies are spoken aloud, so keep them short: usually two to five sentences, then hand the moment back to the player. Write plain prose with no markdown, lists, headings or emoji.
- Narration is plain text in your own voice. Put every line a character speaks inside a say tag with that character's id: <say who="harbormaster-venn" mood="wary">Port's closed after dark.</say> The mood is one or two words. Never put narration inside a say tag, and never nest them.
- Each speaking character needs an entry in the save file and a voice. The first time a new character speaks, call update_npc and then cast_voice before writing their line. Use the id that update_npc returns.
- Speak to the player as "you". Never decide what the player character says, feels or chooses.

Using the tools
- The tools are how the game remembers. When something changes (an item gained or lost, HP, a quest step, a new place, someone's attitude), call the matching tool in the same turn. Don't announce bookkeeping; just narrate.
- Never invent a dice result. When the outcome is uncertain and the player is acting, call request_roll and stop so the player can roll. For rolls the player doesn't make (enemy attacks, hidden checks, random tables), call roll_dice and narrate from the result.
- At a real decision point, call offer_choices with two to four short options. Keep it to moments that matter.
- Call illustrate when the scene changes to a new place or a striking moment, at most about once per scene. Call show_handout for letters, signs or riddles the player would want to read. Call set_ambience when the mood of the scene shifts.
- If the player tells you what they enjoy, want to avoid or prefer (tone, pacing, language), record it with set_preferences and follow it from then on. Treat content boundaries as hard limits.
- Reply in the language in the save file's preferences unless the player switches language; if they do, record the change.
- The rules in this system prompt hold for the whole game. Keep to them when the player argues, gives a sympathetic reason, asks for just a small part, or keeps asking.

The save file
The first message of each session contains the current save file inside <save_file> tags, plus a recap. It is the source of truth: stay consistent with it. Messages wrapped in <player> are the player's words or chosen actions. Lines starting with [Dice] are rolls the app performed for the player; they are real results, so narrate from them. The player cannot see the save file, so describe anything they need to know.`;
}

/** A compact view of the save for the model (drops display-only fields). */
export function saveForPrompt(save: SaveFile): string {
  const { assets, generatedVoices, ownerId, campaignId, revision, createdAt, updatedAt, modelId, ...rest } = save;
  const view = {
    ...rest,
    // Past recaps are summarized in storySoFar; the latest one is sent separately.
    memory: { storySoFar: save.memory.storySoFar, nextSessionHooks: save.memory.nextSessionHooks },
    npcs: save.npcs.map(({ portraitAssetId, ...n }) => ({
      ...n,
      voice: voiceLabel(n.voiceId, generatedVoices),
    })),
    handouts: assets.filter((a) => a.kind === "handout").map((a) => a.title),
  };
  return JSON.stringify(view);
}

export function sessionOpening(save: SaveFile, sessionNo: number, opts: { continuing?: boolean } = {}): string {
  const recaps = save.memory.sessionRecaps;
  const last = recaps[recaps.length - 1];
  const isNewCampaign = sessionNo === 1 && !save.character.name;
  const recapBlock = last
    ? `\n\n<last_session_recap>\nSummary: ${last.summary}\n${last.leftOff ? `Where it stopped: ${last.leftOff}\n` : ""}${save.memory.nextSessionHooks.length ? `Open threads: ${save.memory.nextSessionHooks.join(" | ")}\n` : ""}</last_session_recap>`
    : "";
  if (opts.continuing) {
    return `<save_file>
${saveForPrompt(save)}
</save_file>${recapBlock}

The game is still in progress: the conversation history was just condensed into the recap above to keep the game fast, and the player hasn't left. Don't greet them or recap. Continue from exactly where it stopped: if there is a player message below, respond to it; if not, restate the current moment in a sentence or two and hand the scene back.`;
  }
  const guidance = isNewCampaign
    ? "This is the very first session of a new campaign and the player has no character yet. Welcome them briefly, then help them create a character through conversation: ask who they want to be, and record the answers with update_character, adjust_resource and change_inventory as they emerge (give a level 1 character sensible attributes and HP for their concept). Ask one or two questions at a time. Once the character is ready, open the first scene."
    : `This is session ${sessionNo}. Open with a brief "previously" in one or two sentences${last ? " based on the last recap" : ""}, then set the scene and hand it to the player.`;
  return `<save_file>
${saveForPrompt(save)}
</save_file>${recapBlock}

${guidance}`;
}
