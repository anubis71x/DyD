import mongoose from "mongoose";
import { connectToDB } from "@/lib/mongoDB";
import User from "@/lib/models/User";
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
    usage: { type: mongoose.Schema.Types.Mixed },
  },
  { versionKey: false, minimize: false },
);
playSessionSchema.index({ ownerId: 1, campaignId: 1, sessionNo: -1 });

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
      await PlaySessionModel.updateOne({ _id: sessionId, ownerId }, { $set });
    },
  },
  wallet: {
    async balance(userId) {
      const u = await User.findOne({ userId }).lean<{ availablePoints?: number }>();
      return u?.availablePoints ?? 0;
    },
    async debit(userId, amount) {
      const res = await User.updateOne(
        { userId, availablePoints: { $gte: amount } },
        { $inc: { availablePoints: -amount }, $set: { updatedAt: new Date() } },
      );
      return res.modifiedCount === 1;
    },
    async credit(userId, amount) {
      await User.updateOne({ userId }, { $inc: { availablePoints: amount }, $set: { updatedAt: new Date() } }, { upsert: true });
    },
  },
};
