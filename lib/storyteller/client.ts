import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/** Shared API client (reads ANTHROPIC_API_KEY from the environment). */
export const getClient = () => (client ??= new Anthropic());

/** One turn (or recap) per campaign at a time, across all server instances. */
export const campaignLockKey = (userId: string, campaignId: string) => `campaign:${userId}:${campaignId}`;
/** Longer than the turn route's maxDuration, so a crashed turn's lock frees itself. */
export const CAMPAIGN_LOCK_TTL_MS = 150_000;

/**
 * Take the campaign lock, waiting up to `waitMs` for the holder to finish
 * (e.g. the compaction that runs right after a turn). Returns null on timeout.
 */
export async function acquireCampaignLock(
  locks: { acquire(key: string, ttlMs: number): Promise<string | null> },
  key: string,
  waitMs = 30_000,
): Promise<string | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const token = await locks.acquire(key, CAMPAIGN_LOCK_TTL_MS);
    if (token || Date.now() >= deadline) return token;
    await new Promise((r) => setTimeout(r, 500));
  }
}
