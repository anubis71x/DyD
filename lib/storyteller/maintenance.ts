import type Anthropic from "@anthropic-ai/sdk";
import type { Stores } from "@/lib/save/store";
import { campaignLockKey, CAMPAIGN_LOCK_TTL_MS } from "./client";
import { closeSession, ENGINE_CONFIG } from "./engine";

/**
 * Close sessions nobody has touched for ENGINE_CONFIG.sessionIdleMs, writing
 * their journal recap, so a returning player always gets a "previously on…".
 * Run on a schedule (see app/api/cron/close-sessions and
 * scripts/close-idle-sessions.ts). Skips campaigns that are mid-turn.
 */
export async function closeIdleSessions(stores: Stores, client: Anthropic, opts: { limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const before = new Date(now.getTime() - ENGINE_CONFIG.sessionIdleMs).toISOString();
  const idle = await stores.sessions.listIdle(before, opts.limit ?? 50);
  let closed = 0;
  for (const session of idle) {
    const key = campaignLockKey(session.ownerId, session.campaignId);
    const lock = await stores.locks.acquire(key, CAMPAIGN_LOCK_TTL_MS);
    if (!lock) continue;
    try {
      // Re-read under the lock: the player may have come back meanwhile.
      const latest = await stores.sessions.latest(session.ownerId, session.campaignId);
      if (latest?.sessionId !== session.sessionId || latest.endedAt || latest.lastActiveAt >= before) continue;
      await closeSession(session.ownerId, session.campaignId, latest, { stores, client, emit: () => {} });
      closed++;
    } catch (err) {
      console.error(`[close-idle] ${session.sessionId}`, (err as Error).message);
    } finally {
      await stores.locks.release(key, lock);
    }
  }
  return { found: idle.length, closed };
}
