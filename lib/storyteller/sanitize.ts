/**
 * Neutralize anything in player-supplied text that looks like the prompt's
 * own markers, so a player can't fake a dice result, close their <player>
 * tag, or pose as the save file, a recap or feedback.
 */
export function sanitizePlayerText(text: string, max: number): string {
  return text
    .slice(0, max)
    .replace(/<\s*\/?\s*(player_feedback|player|save_file|this_session_so_far|last_session_recap|say)\b[^>]*>/gi, "")
    .replace(/\[\s*dice\s*\]/gi, "(dice)")
    .trim();
}
