import { randomUUID } from "crypto";
import { applyEvents, newSave } from "./reducer";
import { SaveFileSchema, type SaveEvent, type SaveFile } from "./schema";
import type { StoredEvent, Stores } from "./store";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export async function createCampaign(
  stores: Stores,
  ownerId: string,
  params: { title: string; storytellerId: string; language?: string },
  now = new Date().toISOString(),
): Promise<SaveFile> {
  const save = newSave({ campaignId: randomUUID(), ownerId, now, ...params });
  await stores.campaigns.insert(save);
  return save;
}

/** Store an imported or migrated save under `ownerId` with a fresh id. */
export async function adoptSave(stores: Stores, ownerId: string, save: SaveFile, now = new Date().toISOString()): Promise<SaveFile> {
  const adopted = SaveFileSchema.parse({ ...save, campaignId: randomUUID(), ownerId, updatedAt: now });
  await stores.campaigns.insert(adopted);
  return adopted;
}

export async function loadCampaign(stores: Stores, ownerId: string, campaignId: string): Promise<SaveFile> {
  const save = await stores.campaigns.get(ownerId, campaignId);
  if (!save) throw new NotFoundError("Campaign not found");
  return save;
}

/**
 * Apply events with optimistic concurrency: re-read and re-apply if another
 * writer bumped the revision in between. Events are logged after the
 * snapshot write succeeds, tagged with the revision they produced.
 */
export async function commitEvents(
  stores: Stores,
  ownerId: string,
  campaignId: string,
  events: SaveEvent[],
  source: StoredEvent["source"],
  maxAttempts = 4,
): Promise<SaveFile> {
  if (!events.length) return loadCampaign(stores, ownerId, campaignId);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await loadCampaign(stores, ownerId, campaignId);
    const now = new Date().toISOString();
    const next = applyEvents(current, events, now);
    if (await stores.campaigns.replaceIfRevision(next, current.revision)) {
      await stores.campaigns.appendEvents(
        events.map((event, i) => ({ campaignId, revision: current.revision + i + 1, event, source, at: now })),
      );
      return next;
    }
  }
  throw new ConflictError("The save changed too many times while writing. Try again.");
}
