import type { SaveFile } from "./schema";
import { summarize, type LedgerEntry, type PlaySession, type StoredEvent, type Stores } from "./store";

/** In-memory Stores for tests and local scripts. Not for production. */
export function createMemoryStores(initialBalances: Record<string, number> = {}) {
  const campaigns = new Map<string, SaveFile>();
  const events: StoredEvent[] = [];
  const sessions = new Map<string, PlaySession>();
  const balances = new Map(Object.entries(initialBalances));
  const ledger = new Map<string, LedgerEntry>();
  const locks = new Map<string, { token: string; expiresAt: number }>();
  const clone = <T,>(x: T): T => structuredClone(x);

  const stores: Stores = {
    campaigns: {
      async list(ownerId) {
        return Array.from(campaigns.values())
          .filter((s) => s.ownerId === ownerId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(summarize);
      },
      async get(ownerId, id) {
        const s = campaigns.get(id);
        return s && s.ownerId === ownerId ? clone(s) : null;
      },
      async insert(save) {
        if (campaigns.has(save.campaignId)) throw new Error("duplicate campaign");
        campaigns.set(save.campaignId, clone(save));
      },
      async replaceIfRevision(save, expected) {
        const cur = campaigns.get(save.campaignId);
        if (!cur || cur.ownerId !== save.ownerId || cur.revision !== expected) return false;
        campaigns.set(save.campaignId, clone(save));
        return true;
      },
      async remove(ownerId, id) {
        const cur = campaigns.get(id);
        if (!cur || cur.ownerId !== ownerId) return false;
        campaigns.delete(id);
        return true;
      },
      async appendEvents(evts) {
        events.push(...clone(evts));
      },
    },
    sessions: {
      async latest(ownerId, campaignId) {
        const all = Array.from(sessions.values()).filter((s) => s.ownerId === ownerId && s.campaignId === campaignId);
        all.sort((a, b) => b.sessionNo - a.sessionNo);
        return all[0] ? clone(all[0]) : null;
      },
      async count(ownerId, campaignId) {
        return Array.from(sessions.values()).filter((s) => s.ownerId === ownerId && s.campaignId === campaignId).length;
      },
      async create(session) {
        sessions.set(session.sessionId, clone(session));
      },
      async listIdle(before, limit) {
        return Array.from(sessions.values())
          .filter((s) => !s.endedAt && s.lastActiveAt < before)
          .sort((a, b) => a.lastActiveAt.localeCompare(b.lastActiveAt))
          .slice(0, limit)
          .map(clone);
      },
      async update(ownerId, sessionId, patch) {
        const s = sessions.get(sessionId);
        if (s && s.ownerId === ownerId) sessions.set(sessionId, { ...s, ...clone(patch) });
      },
    },
    wallet: {
      async balance(userId) {
        return balances.get(userId) ?? 0;
      },
      async post({ requireFunds, ...entry }) {
        if (ledger.has(entry.refId)) return "duplicate";
        const cur = balances.get(entry.userId) ?? 0;
        if (requireFunds && entry.amountMicros < 0 && cur + entry.amountMicros < 0) return "insufficient";
        ledger.set(entry.refId, { ...clone(entry), createdAt: new Date().toISOString() });
        balances.set(entry.userId, cur + entry.amountMicros);
        return "ok";
      },
      async releaseStaleHolds(userId, olderThanMs) {
        const cutoff = Date.now() - olderThanMs;
        let n = 0;
        for (const e of Array.from(ledger.values())) {
          if (e.userId !== userId || e.kind !== "hold" || new Date(e.createdAt).getTime() > cutoff) continue;
          const releaseRef = e.refId.replace(/:hold$/, ":release");
          if (ledger.has(releaseRef)) continue;
          if ((await stores.wallet.post({ refId: releaseRef, userId, amountMicros: -e.amountMicros, kind: "release", meta: { stale: true } })) === "ok") n++;
        }
        return n;
      },
    },
    locks: {
      async acquire(key, ttlMs) {
        const cur = locks.get(key);
        if (cur && cur.expiresAt > Date.now()) return null;
        const token = Math.random().toString(36).slice(2);
        locks.set(key, { token, expiresAt: Date.now() + ttlMs });
        return token;
      },
      async release(key, token) {
        if (locks.get(key)?.token === token) locks.delete(key);
      },
    },
  };
  return { stores, _debug: { campaigns, events, sessions, balances, ledger, locks } };
}
