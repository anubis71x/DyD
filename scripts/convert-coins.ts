/**
 * One-time conversion of legacy coin balances (User.availablePoints) into
 * dollar wallet credit.
 *
 *   yarn billing:convert-coins            # dry run
 *   yarn billing:convert-coins --apply    # write ledger entries
 *
 * Rate: what a coin cost in the $10 pack ($10 / 60 coins ≈ $0.1667). Old
 * purchases can't be matched to users (payments were stored without a user
 * id), so one rate is used for everyone. It is the highest per-coin price,
 * so nobody gets back less than they paid; the 15 free starting coins
 * convert to $2.50, the same as the new signup credit.
 * Override with --rate=0.15 (USD per coin).
 *
 * Idempotent: the ledger refId is `conversion:<userId>`, and converted users
 * get availablePoints = 0 plus a record of what was converted.
 */
import mongoose from "mongoose";
import { formatUsd, LEGACY_COIN_MICROS } from "../lib/billing/money";
import { getMongoStores } from "../lib/save/mongoStore";

const apply = process.argv.includes("--apply");
const rateArg = process.argv.find((a) => a.startsWith("--rate="));
const microsPerCoin = rateArg ? Math.round(Number(rateArg.split("=")[1]) * 1_000_000) : LEGACY_COIN_MICROS;

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("Set MONGODB_URL first.");
  if (!Number.isFinite(microsPerCoin) || microsPerCoin <= 0) throw new Error("Invalid --rate");
  const stores = await getMongoStores();
  const users = mongoose.connection.db!.collection("users");
  const pending = await users.find({ availablePoints: { $gt: 0 } }).toArray();
  console.log(`${pending.length} user(s) with coins · rate ${formatUsd(microsPerCoin)} per coin${apply ? "" : " (dry run)"}`);

  let total = 0;
  for (const u of pending) {
    const coins = Number(u.availablePoints);
    const micros = Math.round(coins * microsPerCoin);
    total += micros;
    console.log(`  ${u.userId}: ${coins} coins → ${formatUsd(micros)}`);
    if (!apply) continue;
    const result = await stores.wallet.post({
      refId: `conversion:${u.userId}`,
      userId: u.userId,
      amountMicros: micros,
      kind: "conversion",
      meta: { coins, microsPerCoin },
    });
    if (result === "ok" || result === "duplicate") {
      await users.updateOne(
        { _id: u._id, availablePoints: u.availablePoints },
        { $set: { availablePoints: 0, convertedCoins: coins, convertedAt: new Date() } },
      );
    }
    if (result === "duplicate") console.log(`    already converted earlier; cleared leftover coins`);
  }
  console.log(`Total: ${formatUsd(total)}${apply ? " credited" : ". Re-run with --apply to credit."}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
