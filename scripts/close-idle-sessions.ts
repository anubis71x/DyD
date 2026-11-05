/**
 * Close sessions idle for 6+ hours, writing their journal recaps.
 *   yarn sessions:close-idle
 * Needs MONGODB_URL and ANTHROPIC_API_KEY. Safe to run on a timer (cron):
 * it skips campaigns that are mid-turn and sessions already closed.
 */
import mongoose from "mongoose";
import { getMongoStores } from "../lib/save/mongoStore";
import { getClient } from "../lib/storyteller/client";
import { closeIdleSessions } from "../lib/storyteller/maintenance";

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("Set MONGODB_URL first.");
  const result = await closeIdleSessions(await getMongoStores(), getClient(), { limit: 500 });
  console.log(`Idle sessions found: ${result.found}, closed with a recap: ${result.closed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
