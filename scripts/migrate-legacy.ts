/**
 * One-time migration: legacy per-session collections → campaign save files.
 *
 *   yarn migrate:legacy            # dry run: report what would change
 *   yarn migrate:legacy --apply    # write campaigns
 *
 * Needs MONGODB_URL. Idempotent: each converted Session gets a
 * `migratedCampaignId`, and sessions that already have one are skipped.
 * Legacy collections are left in place; delete them after checking the
 * result and taking a backup.
 */
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import { legacyToSave } from "../lib/save/legacy";
import { DEFAULT_STORYTELLER_ID } from "../lib/storyteller/storytellers";

const apply = process.argv.includes("--apply");

async function main() {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error("Set MONGODB_URL first.");
  await mongoose.connect(url, { dbName: "Borcelle_Admin" });
  const db = mongoose.connection.db!;
  const col = (name: string) => db.collection(name);

  const sessions = await col("sessions").find({ migratedCampaignId: { $exists: false } }).toArray();
  console.log(`${sessions.length} legacy session(s) to convert${apply ? "" : " (dry run)"}`);

  let ok = 0;
  let failed = 0;
  for (const session of sessions) {
    const sessionId = session._id;
    try {
      const [character, quests, npcsRelations, worldState, mechanicsTracking, playerPreferences] = await Promise.all(
        ["characters", "quests", "npcsrelations", "worldstates", "mechanicstrackings", "playerpreferences"].map((c) =>
          col(c).findOne({ sessionId }),
        ),
      );
      const save = legacyToSave(
        { session: session as any, character, quests, npcsRelations, worldState, mechanicsTracking, playerPreferences },
        randomUUID(),
        DEFAULT_STORYTELLER_ID,
        new Date().toISOString(),
      );
      console.log(`  ${sessionId} → "${save.title}" (${save.character.name || "no character"}, ${save.quests.length} quests, ${save.npcs.length} NPCs)`);
      if (apply) {
        await col("campaigns").insertOne({
          _id: save.campaignId as any,
          ownerId: save.ownerId,
          revision: save.revision,
          updatedAt: new Date(save.updatedAt),
          data: save,
        });
        await col("sessions").updateOne({ _id: sessionId }, { $set: { migratedCampaignId: save.campaignId } });
      }
      ok++;
    } catch (err) {
      failed++;
      console.error(`  ${sessionId} FAILED:`, (err as Error).message);
    }
  }
  console.log(`Done: ${ok} converted, ${failed} failed${apply ? "" : ". Re-run with --apply to write."}`);
  await mongoose.disconnect();
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
