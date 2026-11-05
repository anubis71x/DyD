import mongoose from "mongoose";
import { connectToDB } from "@/lib/mongoDB";
import type { SaveFile } from "./schema";
import { summarize, type PlaySession, type Stores } from "./store";

/* Collections for the new save system. The legacy per-session collections
 * stay untouched until the migration script has run (see scripts/). */

const campaignSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    revision: { type: Number, required: true },
    updatedAt: { type: Date, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true }, // the SaveFile
  },
  { versionKey: false, minimize: false },
);
campaignSchema.index({ ownerId: 1, updatedAt: -1 });

const campaignEventSchema = new mongoose.Schema(
  {
    campaignId: { type: String, required: true },
    revision: { type: Number, required: true },
    event: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["tool", "user", "system"], required: true },
    at: { type: Date, required: true },
  },
  { versionKey: false, minimize: false },
);
campaignEventSchema.index({ campaignId: 1, revision: 1 }, { unique: true });

const playSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    campaignId: { type: String, required: true },
    ownerId: { type: String, required: true },
    sessionNo: { type: Number, required: true },
    messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    startedAt: { type: Date, required: true },
    lastActiveAt: { type: Date, required: true },
    endedAt: { type: Date },
    recappedAt: { type: Date },
    partNo: { type: Number },
    earlierLines: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    carry: { type: mongoose.Schema.Types.Mixed },
    lastPromptTokens: { type: Number },
    pendingCheck: { type: mongoose.Schema.Types.Mixed },
    usage: { type: mongoose.Schema.Types.Mixed },
  },
  { versionKey: false, minimize: false },
);
playSessionSchema.index({ ownerId: 1, campaignId: 1, sessionNo: -1 });
playSessionSchema.index({ endedAt: 1, lastActiveAt: 1 });

/* Money. Balances are a cache of the ledger: `scripts/billing.ts reconcile`
 * recomputes them from ledger entries if a crash ever left them out of step. */
const walletSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, balanceMicros: { type: Number, required: true, default: 0 }, updatedAt: { type: Date } },
  { versionKey: false },
);
const ledgerSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // refId: unique, makes posting idempotent
    userId: { type: String, required: true, index: true },
    amountMicros: { type: Number, required: true },
    kind: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, required: true, index: true },
  },
  { versionKey: false, minimize: false },
);

export const WalletModel = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
export const LedgerModel = mongoose.models.LedgerEntry || mongoose.model("LedgerEntry", ledgerSchema, "ledger");

const lockSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, token: { type: String, required: true }, expiresAt: { type: Date, required: true } },
  { versionKey: false },
);
// Let MongoDB delete long-expired locks on its own.
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
const LockModel = mongoose.models.Lock || mongoose.model("Lock", lockSchema);

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

const CampaignModel = mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
const CampaignEventModel = mongoose.models.CampaignEvent || mongoose.model("CampaignEvent", campaignEventSchema);
const PlaySessionModel = mongoose.models.PlaySession || mongoose.model("PlaySession", playSessionSchema);

const toSession = (d: Record<string, any>): PlaySession => ({
  sessionId: d._id,
  campaignId: d.campaignId,
  ownerId: d.ownerId,
  sessionNo: d.sessionNo,
  messages: d.messages ?? [],
  startedAt: new Date(d.startedAt).toISOString(),
  lastActiveAt: new Date(d.lastActiveAt).toISOString(),
  ...(d.endedAt ? { endedAt: new Date(d.endedAt).toISOString() } : {}),
  ...(d.recappedAt ? { recappedAt: new Date(d.recappedAt).toISOString() } : {}),
  ...(d.partNo ? { partNo: d.partNo } : {}),
  ...(d.earlierLines ? { earlierLines: d.earlierLines } : {}),
  ...(d.carry ? { carry: d.carry } : {}),
  ...(d.lastPromptTokens !== undefined && d.lastPromptTokens !== null ? { lastPromptTokens: d.lastPromptTokens } : {}),
  ...(d.pendingCheck ? { pendingCheck: d.pendingCheck } : {}),
  ...(d.usage ? { usage: d.usage } : {}),
});

export async function getMongoStores(): Promise<Stores> {
  await connectToDB();
  return mongoStores;
}

const mongoStores: Stores = {
  campaigns: {
    async list(ownerId) {
      const docs = await CampaignModel.find({ ownerId }).sort({ updatedAt: -1 }).limit(100).lean<{ data: SaveFile }[]>();
      return docs.map((d) => summarize(d.data));
    },
    async get(ownerId, campaignId) {
      const d = await CampaignModel.findOne({ _id: campaignId, ownerId }).lean<{ data: SaveFile }>();
      return d ? d.data : null;
    },
    async insert(save) {
      await CampaignModel.create({
        _id: save.campaignId,
        ownerId: save.ownerId,
        revision: save.revision,
        updatedAt: new Date(save.updatedAt),
        data: save,
      });
    },
    async replaceIfRevision(save, expectedRevision) {
      const res = await CampaignModel.updateOne(
        { _id: save.campaignId, ownerId: save.ownerId, revision: expectedRevision },
        { $set: { revision: save.revision, updatedAt: new Date(save.updatedAt), data: save } },
      );
      return res.modifiedCount === 1;
    },
    async remove(ownerId, campaignId) {
      const res = await CampaignModel.deleteOne({ _id: campaignId, ownerId });
      if (res.deletedCount === 1) {
        await Promise.all([
          CampaignEventModel.deleteMany({ campaignId }),
          PlaySessionModel.deleteMany({ campaignId, ownerId }),
        ]);
        return true;
      }
      return false;
    },
    async appendEvents(events) {
      if (!events.length) return;
      await CampaignEventModel.insertMany(events.map((e) => ({ ...e, at: new Date(e.at) })), { ordered: true });
    },
  },
  sessions: {
    async latest(ownerId, campaignId) {
      const d = await PlaySessionModel.findOne({ ownerId, campaignId }).sort({ sessionNo: -1 }).lean<Record<string, any>>();
      return d ? toSession(d) : null;
    },
    async count(ownerId, campaignId) {
      return PlaySessionModel.countDocuments({ ownerId, campaignId });
    },
    async listIdle(before, limit) {
      const docs = await PlaySessionModel.find({ endedAt: { $exists: false }, lastActiveAt: { $lt: new Date(before) } })
        .sort({ lastActiveAt: 1 })
        .limit(limit)
        .lean<Record<string, any>[]>();
      return docs.map(toSession);
    },
    async create(s) {
      await PlaySessionModel.create({
        _id: s.sessionId,
        campaignId: s.campaignId,
        ownerId: s.ownerId,
        sessionNo: s.sessionNo,
        messages: s.messages,
        startedAt: new Date(s.startedAt),
        lastActiveAt: new Date(s.lastActiveAt),
      });
    },
    async update(ownerId, sessionId, patch) {
      const $set: Record<string, unknown> = {};
      if (patch.messages) $set.messages = patch.messages;
      if (patch.lastActiveAt) $set.lastActiveAt = new Date(patch.lastActiveAt);
      if (patch.endedAt) $set.endedAt = new Date(patch.endedAt);
      if (patch.usage) $set.usage = patch.usage;
      if (patch.recappedAt) $set.recappedAt = new Date(patch.recappedAt);
      for (const k of ["partNo", "earlierLines", "carry", "lastPromptTokens", "pendingCheck"] as const) if (patch[k] !== undefined) $set[k] = patch[k];
      await PlaySessionModel.updateOne({ _id: sessionId, ownerId }, { $set });
    },
  },
  wallet: {
    async balance(userId) {
      const w = await WalletModel.findById(userId).lean<{ balanceMicros: number }>();
      return w?.balanceMicros ?? 0;
    },
    async post({ requireFunds, ...entry }) {
      const now = new Date();
      const doc = { _id: entry.refId, userId: entry.userId, amountMicros: entry.amountMicros, kind: entry.kind, meta: entry.meta ?? {}, createdAt: now };
      if (requireFunds && entry.amountMicros < 0) {
        // Take the money first, only if it's there, then record why.
        const res = await WalletModel.updateOne(
          { _id: entry.userId, balanceMicros: { $gte: -entry.amountMicros } },
          { $inc: { balanceMicros: entry.amountMicros }, $set: { updatedAt: now } },
        );
        if (res.modifiedCount !== 1) return "insufficient";
        try {
          await LedgerModel.create(doc);
        } catch (e) {
          await WalletModel.updateOne({ _id: entry.userId }, { $inc: { balanceMicros: -entry.amountMicros } });
          if (isDuplicateKey(e)) return "duplicate";
          throw e;
        }
        return "ok";
      }
      try {
        await LedgerModel.create(doc);
      } catch (e) {
        if (isDuplicateKey(e)) return "duplicate";
        throw e;
      }
      await WalletModel.updateOne({ _id: entry.userId }, { $inc: { balanceMicros: entry.amountMicros }, $set: { updatedAt: now } }, { upsert: true });
      return "ok";
    },
    async releaseStaleHolds(userId, olderThanMs) {
      const cutoff = new Date(Date.now() - olderThanMs);
      const holds = await LedgerModel.find({ userId, kind: "hold", createdAt: { $lt: cutoff } }).sort({ createdAt: -1 }).limit(50).lean<{ _id: string; amountMicros: number }[]>();
      if (!holds.length) return 0;
      const releaseIds = holds.map((h) => h._id.replace(/:hold$/, ":release"));
      const released = new Set((await LedgerModel.find({ _id: { $in: releaseIds } }, { _id: 1 }).lean<{ _id: string }[]>()).map((d) => d._id));
      let n = 0;
      for (const h of holds) {
        const refId = h._id.replace(/:hold$/, ":release");
        if (released.has(refId)) continue;
        if ((await mongoStores.wallet.post({ refId, userId, amountMicros: -h.amountMicros, kind: "release", meta: { stale: true } })) === "ok") n++;
      }
      return n;
    },
  },
  locks: {
    async acquire(key, ttlMs) {
      const token = new mongoose.Types.ObjectId().toHexString();
      const expiresAt = new Date(Date.now() + ttlMs);
      try {
        await LockModel.create({ _id: key, token, expiresAt });
        return token;
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
      // Someone holds it; take it over only if it has expired.
      const res = await LockModel.updateOne({ _id: key, expiresAt: { $lt: new Date() } }, { $set: { token, expiresAt } });
      return res.modifiedCount === 1 ? token : null;
    },
    async release(key, token) {
      await LockModel.deleteOne({ _id: key, token });
    },
  },
};
