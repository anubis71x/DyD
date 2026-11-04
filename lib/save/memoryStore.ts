import type { SaveFile } from "./schema";
import { summarize, type PlaySession, type StoredEvent, type Stores } from "./store";

/** In-memory Stores for tests and local scripts. Not for production. */
export function createMemoryStores(initialCoins: Record<string, number> = {}) {
  const campaigns = new Map<string, SaveFile>();
  const events: StoredEvent[] = [];
  const sessions = new Map<string, PlaySession>();
  const coins = new Map(Object.entries(initialCoins));
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
      async update(ownerId, sessionId, patch) {
        const s = sessions.get(sessionId);
        if (s && s.ownerId === ownerId) sessions.set(sessionId, { ...s, ...clone(patch) });
      },
    },
    wallet: {
      async balance(userId) {
        return coins.get(userId) ?? 0;
      },
      async debit(userId, amount) {
        const cur = coins.get(userId) ?? 0;
        if (cur < amount) return false;
        coins.set(userId, cur - amount);
        return true;
      },
      async credit(userId, amount) {
        coins.set(userId, (coins.get(userId) ?? 0) + amount);
      },
    },
  };
  return { stores, _debug: { campaigns, events, sessions, coins } };
}
