import { connectToDB } from "@/lib/mongoDB";
import { LedgerModel } from "@/lib/save/mongoStore";

export interface BillingReport {
  month: string;
  topups: { micros: number; count: number };
  signupCredit: { micros: number; count: number };
  conversions: { micros: number; count: number };
  charged: { micros: number; count: number };
  providerMicros: number;
  marginMicros: number;
  byModel: { model: string; turns: number; chargedMicros: number; providerMicros: number }[];
  openHolds: number;
}

/** Revenue, provider cost and margin for one calendar month (UTC), from the ledger. */
export async function monthlyReport(month: string): Promise<BillingReport> {
  const start = new Date(`${month}-01T00:00:00Z`);
  if (!/^\d{4}-\d{2}$/.test(month) || Number.isNaN(start.getTime())) throw new Error("Use a month like 2026-11");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  await connectToDB();
  const inMonth = { createdAt: { $gte: start, $lt: end } };

  const [kinds, byModel, holds] = await Promise.all([
    LedgerModel.aggregate<{ _id: string; amount: number; provider: number; count: number }>([
      { $match: inMonth },
      { $group: { _id: "$kind", amount: { $sum: "$amountMicros" }, provider: { $sum: { $ifNull: ["$meta.providerMicros", 0] } }, count: { $sum: 1 } } },
    ]),
    LedgerModel.aggregate<{ _id: string; charged: number; provider: number; turns: number }>([
      { $match: { ...inMonth, kind: "charge" } },
      { $group: { _id: "$meta.model", charged: { $sum: { $multiply: ["$amountMicros", -1] } }, provider: { $sum: { $ifNull: ["$meta.providerMicros", 0] } }, turns: { $sum: 1 } } },
      { $sort: { charged: -1 } },
    ]),
    LedgerModel.aggregate<{ n: number }>([
      { $match: { kind: { $in: ["hold", "release"] } } },
      { $group: { _id: { $arrayElemAt: [{ $split: ["$_id", ":"] }, 1] }, sum: { $sum: "$amountMicros" } } },
      { $match: { sum: { $ne: 0 } } },
      { $count: "n" },
    ]),
  ]);
  const k = Object.fromEntries(kinds.map((r) => [r._id, r]));
  const pick = (kind: string, sign = 1) => ({ micros: sign * (k[kind]?.amount ?? 0), count: k[kind]?.count ?? 0 });
  const charged = pick("charge", -1);
  const providerMicros = k.charge?.provider ?? 0;
  return {
    month,
    topups: pick("topup"),
    signupCredit: pick("signup_grant"),
    conversions: pick("conversion"),
    charged,
    providerMicros,
    marginMicros: charged.micros - providerMicros,
    byModel: byModel.map((m) => ({ model: m._id ?? "unknown", turns: m.turns, chargedMicros: m.charged, providerMicros: m.provider })),
    openHolds: holds[0]?.n ?? 0,
  };
}
