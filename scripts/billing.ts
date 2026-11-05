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
import { monthlyReport } from "../lib/billing/report";
import { getMongoStores, LedgerModel, WalletModel } from "../lib/save/mongoStore";

async function report(month: string) {
  const r = await monthlyReport(month);
  console.log(`Billing report for ${r.month} (markup ${Math.round(MARKUP * 100)}%)`);
  console.log(`  Top-ups:        ${formatUsd(r.topups.micros)} (${r.topups.count} payments, before Stripe fees)`);
  console.log(`  Signup credit:  ${formatUsd(r.signupCredit.micros)} (${r.signupCredit.count} users)`);
  console.log(`  Coin conversion:${formatUsd(r.conversions.micros)} (${r.conversions.count} users)`);
  console.log(`  Charged:        ${formatUsd(r.charged.micros)} (${r.charged.count} charges)`);
  console.log(`  Provider cost:  ${formatUsd(r.providerMicros)}`);
  console.log(`  Gross margin:   ${formatUsd(r.marginMicros)}`);
  for (const m of r.byModel) {
    console.log(`    ${m.model}: ${m.turns} charges, charged ${formatUsd(m.chargedMicros)}, cost ${formatUsd(m.providerMicros)}`);
  }
  if (r.openHolds) console.log(`  Note: ${r.openHolds} hold(s) not yet released (turns in progress, or crashed turns waiting for the player's next turn).`);
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
