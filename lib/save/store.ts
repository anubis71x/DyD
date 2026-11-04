import type { SaveEvent, SaveFile } from "./schema";

/**
 * Storage interfaces. Every method that reads or writes a campaign takes the
 * owner id, so there is no way to fetch someone else's save by id alone.
 * `mongoStore.ts` is the production implementation; `memoryStore.ts` is for
 * tests and local scripts.
 */

export interface CampaignSummary {
  campaignId: string;
  title: string;
  storytellerId: string;
  modelId?: string;
  characterName: string;
  updatedAt: string;
  revision: number;
  lastRecap?: string;
}

export interface StoredEvent {
  campaignId: string;
  revision: number; // revision of the save after this event was applied
  event: SaveEvent;
  source: "tool" | "user" | "system";
  at: string;
}

/** Messages are stored exactly as sent/received so history stays append-only. */
export interface PlaySession {
  sessionId: string;
  campaignId: string;
  ownerId: string;
  sessionNo: number;
  messages: unknown[];
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  /** API usage per model for this session, to price coins from real numbers. */
  usage?: Record<string, SessionUsage>;
}

export interface SessionUsage {
  turns: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  coins: number;
}

export interface Stores {
  campaigns: {
    list(ownerId: string): Promise<CampaignSummary[]>;
    get(ownerId: string, campaignId: string): Promise<SaveFile | null>;
    insert(save: SaveFile): Promise<void>;
    /** Replace only if the stored revision still equals `expectedRevision`. */
    replaceIfRevision(save: SaveFile, expectedRevision: number): Promise<boolean>;
    remove(ownerId: string, campaignId: string): Promise<boolean>;
    appendEvents(events: StoredEvent[]): Promise<void>;
  };
  sessions: {
    latest(ownerId: string, campaignId: string): Promise<PlaySession | null>;
    count(ownerId: string, campaignId: string): Promise<number>;
    create(session: PlaySession): Promise<void>;
    update(ownerId: string, sessionId: string, patch: Partial<Pick<PlaySession, "messages" | "lastActiveAt" | "endedAt" | "usage">>): Promise<void>;
  };
  wallet: {
    balance(userId: string): Promise<number>;
    /** Atomically subtract `amount` if the balance covers it. */
    debit(userId: string, amount: number): Promise<boolean>;
    credit(userId: string, amount: number): Promise<void>;
  };
}

export function summarize(save: SaveFile): CampaignSummary {
  const recaps = save.memory.sessionRecaps;
  return {
    campaignId: save.campaignId,
    title: save.title,
    storytellerId: save.storytellerId,
    ...(save.modelId ? { modelId: save.modelId } : {}),
    characterName: save.character.name,
    updatedAt: save.updatedAt,
    revision: save.revision,
    ...(recaps.length ? { lastRecap: recaps[recaps.length - 1].summary } : {}),
  };
}
