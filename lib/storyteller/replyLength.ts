/**
 * How long the storyteller's replies are: a per-campaign player setting.
 * Client-safe. The system prompt describes every level (so it stays cached);
 * the engine tells the storyteller which one is active with a short
 * <table_settings> note whenever it changes.
 */

export const REPLY_LENGTHS = ["brief", "standard", "rich"] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];
export const DEFAULT_REPLY_LENGTH: ReplyLength = "standard";

export const REPLY_LENGTH_INFO: Record<ReplyLength, { label: string; hint: string; guide: string; maxWords: number }> = {
  brief: {
    label: "Brief",
    hint: "Quick back-and-forth. Cheapest and fastest.",
    guide: "one to three sentences (under about 50 words, dialogue included); get to the point and hand the moment back",
    maxWords: 80,
  },
  standard: {
    label: "Standard",
    hint: "A few sentences per reply.",
    guide: "two to five sentences (about 40 to 90 words, dialogue included); one vivid detail beats three",
    maxWords: 160,
  },
  rich: {
    label: "Rich",
    hint: "Fuller scenes and dialogue. Costs a little more per turn.",
    guide:
      "up to three short paragraphs (about 250 words) when the moment deserves it: fuller description, more of the senses, longer exchanges between characters. Quiet or simple moments stay short, and every reply still ends by handing the moment back",
    maxWords: 320,
  },
};

export function getReplyLength(v: string | undefined): ReplyLength {
  return (REPLY_LENGTHS as readonly string[]).includes(v ?? "") ? (v as ReplyLength) : DEFAULT_REPLY_LENGTH;
}

/** The note the engine adds to a turn's message when the setting is new to the conversation. */
export const tableSettingsNote = (len: ReplyLength) => `<table_settings>Reply length: ${len}</table_settings>`;
const NOTE = /<table_settings>Reply length: (\w+)<\/table_settings>/g;

/** The reply length most recently announced in a conversation, if any. */
export function announcedReplyLength(messages: unknown[]): string | undefined {
  let found: string | undefined;
  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content as Array<{ type?: string; text?: string }>) {
      if (b.type !== "text" || !b.text) continue;
      for (const x of Array.from(b.text.matchAll(NOTE))) found = x[1];
    }
  }
  return found;
}
