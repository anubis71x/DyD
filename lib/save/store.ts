import type { TranscriptLine } from "@/lib/storyteller/events";
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

/**
 * One sitting at the table. `messages` holds the current part's API history,
 * stored exactly as sent/received so it stays append-only. When the history
 * gets long it is compacted: the part is summarized into `carry`, its visible
 * lines move to `earlierLines`, and a new part starts with empty `messages`.
 */
export interface PlaySession {
  sessionId: string;
  campaignId: string;
  ownerId: string;
  sessionNo: number;
  messages: unknown[];
  /** 1 for the first part; increases with each compaction. */
  partNo?: number;
  /** Visible story lines from earlier parts of this session (for the feed and the final recap). */
  earlierLines?: TranscriptLine[];
  /** Summary of earlier parts, handed to the storyteller at the start of the current part. */
  carry?: SessionCarry;
  /** Real prompt size of the last model call, from the API's usage report. */
  lastPromptTokens?: number;
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
  /** Set once the session's recap has been written to the save file. */
  recappedAt?: string;
  /** API usage per model for this session, to price coins from real numbers. */
  usage?: Record<string, SessionUsage>;
}

export interface SessionCarry {
  summary: string;
  leftOff: string;
  openThreads: string[];
}

export interface SessionUsage {
  turns: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  providerMicros: number;
  chargedMicros: number;
}

export type LedgerKind = "signup_grant" | "topup" | "conversion" | "hold" | "release" | "charge" | "refund" | "adjustment";

export interface LedgerEntryInput {
  refId: string;
  userId: string;
  /** Signed micro-dollars: positive adds to the balance, negative takes from it. */
  amountMicros: number;
  kind: LedgerKind;
  meta?: Record<string, unknown>;
  requireFunds?: boolean;
}

export interface LedgerEntry extends Omit<LedgerEntryInput, "requireFunds"> {
  createdAt: string;
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
    /** Open sessions (any owner) with no activity since `before`, oldest first. For the idle-session job. */
    listIdle(before: string, limit: number): Promise<PlaySession[]>;
    update(ownerId: string, sessionId: string, patch: Partial<Pick<PlaySession, "messages" | "lastActiveAt" | "endedAt" | "recappedAt" | "usage" | "partNo" | "earlierLines" | "carry" | "lastPromptTokens">>): Promise<void>;
  };
  wallet: {
    /** Current balance in micro-dollars (0 if the user has no wallet yet). */
    balance(userId: string): Promise<number>;
    /**
     * Record a ledger entry and apply it to the balance. `refId` is unique:
     * posting the same refId twice returns "duplicate" and changes nothing.
     * With `requireFunds`, a debit that would take the balance below zero is
     * refused ("insufficient") and not recorded.
     */
    post(entry: LedgerEntryInput): Promise<"ok" | "duplicate" | "insufficient">;
    /**
     * Release holds older than `olderThanMs` that were never released (a turn
     * that crashed between hold and settle). Returns how many were released.
     */
    releaseStaleHolds(userId: string, olderThanMs: number): Promise<number>;
  };
  locks: {
    /** Take a named lock for `ttlMs`. Returns a token to release it with, or null if someone else holds it. */
    acquire(key: string, ttlMs: number): Promise<string | null>;
    release(key: string, token: string): Promise<void>;
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
