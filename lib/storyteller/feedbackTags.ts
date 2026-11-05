/** Quick feedback tags. Client-safe: the feedback form shows these. */
export const FEEDBACK_TAGS = [
  { id: "great", label: "Loved it", tone: "up" },
  { id: "funny", label: "Funny", tone: "up" },
  { id: "too_long", label: "Too long", tone: "down" },
  { id: "too_short", label: "Too short", tone: "down" },
  { id: "too_slow", label: "Too slow", tone: "down" },
  { id: "too_fast", label: "Too rushed", tone: "down" },
  { id: "out_of_character", label: "Out of character", tone: "down" },
  { id: "wrong_voice", label: "Voice doesn't fit", tone: "down" },
  { id: "confusing", label: "Confusing", tone: "down" },
  { id: "too_dark", label: "Too dark", tone: "down" },
  { id: "too_easy", label: "Too easy", tone: "down" },
  { id: "too_hard", label: "Too hard", tone: "down" },
] as const;

export const FEEDBACK_TAG_IDS = FEEDBACK_TAGS.map((t) => t.id) as unknown as [(typeof FEEDBACK_TAGS)[number]["id"], ...(typeof FEEDBACK_TAGS)[number]["id"][]];
