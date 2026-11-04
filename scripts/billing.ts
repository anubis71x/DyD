/**
 * Billing operations.
 *
 *   yarn billing report [--month=2026-11]   Revenue, provider cost and margin for a month
 *   yarn billing reconcile [--fix]          Recompute balances from the ledger; --fix writes them
 *
 * Compare the report's "provider cost" with the Anthropic Console's usage
 * and cost page for the same month. A large gap means the rate table in
 * lib/billing/pricing.ts is out of date.
 */
import mongoose from "mongoose";
import { formatUsd } from "../lib/billing/money";
import { MARKUP } from "../lib/billing/pricing";
import { getMongoStores, LedgerModel, WalletModel } from "../lib/save/mongoStore";

async function report(month: string) {
  const start = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new Error("Use --month=YYYY-MM");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const rows = await LedgerModel.aggregate<{ _id: string; amount: number; provider: number; count: number }>([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: "$kind", amount: { $sum: "$amountMicros" }, provider: { $sum: { $ifNull: ["$meta.providerMicros", 0] } }, count: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r]));
  const charged = -(by.charge?.amount ?? 0);
  const provider = by.charge?.provider ?? 0;
  const perModel = await LedgerModel.aggregate<{ _id: string; charged: number; provider: number; turns: number }>([
    { $match: { kind: "charge", createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: "$meta.model", charged: { $sum: { $multiply: ["$amountMicros", -1] } }, provider: { $sum: "$meta.providerMicros" }, turns: { $sum: 1 } } },
    { $sort: { charged: -1 } },
  ]);

  console.log(`Billing report for ${month} (markup ${Math.round(MARKUP * 100)}%)`);
  console.log(`  Top-ups:        ${formatUsd(by.topup?.amount ?? 0)} (${by.topup?.count ?? 0} payments, before Stripe fees)`);
  console.log(`  Signup credit:  ${formatUsd(by.signup_grant?.amount ?? 0)} (${by.signup_grant?.count ?? 0} users)`);
  console.log(`  Charged turns:  ${formatUsd(charged)} (${by.charge?.count ?? 0} turns)`);
  console.log(`  Provider cost:  ${formatUsd(provider)}`);
  console.log(`  Gross margin:   ${formatUsd(charged - provider)}`);
  for (const m of perModel) {
    console.log(`    ${m._id}: ${m.turns} turns, charged ${formatUsd(m.charged)}, cost ${formatUsd(m.provider)}, avg ${formatUsd(m.charged / Math.max(1, m.turns))}/turn`);
  }
  const openHolds = await LedgerModel.aggregate<{ _id: null; n: number }>([
    { $match: { kind: { $in: ["hold", "release"] } } },
    { $group: { _id: { $arrayElemAt: [{ $split: ["$_id", ":"] }, 1] }, sum: { $sum: "$amountMicros" } } },
    { $match: { sum: { $ne: 0 } } },
    { $count: "n" },
  ]);
  if (openHolds[0]?.n) console.log(`  Warning: ${openHolds[0].n} hold(s) never released (crashed turns). Run reconcile, then refund them with an adjustment.`);
}

async function reconcile(fix: boolean) {
  const sums = await LedgerModel.aggregate<{ _id: string; total: number }>([{ $group: { _id: "$userId", total: { $sum: "$amountMicros" } } }]);
  const wallets = new Map((await WalletModel.find().lean<{ _id: string; balanceMicros: number }[]>()).map((w) => [w._id, w.balanceMicros]));
  let drift = 0;
  for (const { _id: userId, total } of sums) {
    const stored = wallets.get(userId) ?? 0;
    if (stored === total) continue;
    drift++;
    console.log(`  ${userId}: wallet ${formatUsd(stored)}, ledger ${formatUsd(total)}`);
    if (fix) await WalletModel.updateOne({ _id: userId }, { $set: { balanceMicros: total, updatedAt: new Date() } }, { upsert: true });
  }
  console.log(drift ? `${drift} wallet(s) out of step${fix ? ", fixed" : ". Re-run with --fix to correct them."}` : "All wallets match the ledger.");
}

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("Set MONGODB_URL first.");
  await getMongoStores();
  const [cmd] = process.argv.slice(2);
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (cmd === "report") await report(arg("month") ?? new Date().toISOString().slice(0, 7));
  else if (cmd === "reconcile") await reconcile(process.argv.includes("--fix"));
  else console.log("Usage: yarn billing report [--month=YYYY-MM] | yarn billing reconcile [--fix]");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
