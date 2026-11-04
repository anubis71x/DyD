import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStores } from "@/lib/save/memoryStore";

let mem = createMemoryStores();
vi.mock("@/lib/save/mongoStore", () => ({ getMongoStores: async () => mem.stores }));

const SECRET = "whsec_test_secret";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-02-24.acacia" });

function event(intent: Partial<Stripe.PaymentIntent>, type = "payment_intent.succeeded") {
  return JSON.stringify({
    id: "evt_1",
    object: "event",
    type,
    data: { object: { id: "pi_1", object: "payment_intent", currency: "usd", amount_received: 1000, metadata: { kind: "topup", userId: "user_1" }, ...intent } },
  });
}

async function deliver(payload: string, secret = SECRET) {
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return POST(new Request("http://x/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
}

describe("stripe webhook", () => {
  beforeEach(() => {
    mem = createMemoryStores();
  });

  it("credits a paid top-up exactly once, even if Stripe resends it", async () => {
    expect((await deliver(event({}))).status).toBe(200);
    expect((await deliver(event({}))).status).toBe(200);
    expect(await mem.stores.wallet.balance("user_1")).toBe(10_000_000);
    expect(Array.from(mem._debug.ledger.values())).toEqual([expect.objectContaining({ refId: "topup:pi_1", kind: "topup", amountMicros: 10_000_000 })]);
  });

  it("rejects forged signatures", async () => {
    const res = await deliver(event({}), "whsec_wrong");
    expect(res.status).toBe(400);
    expect(mem._debug.ledger.size).toBe(0);
  });

  it("ignores payments that aren't top-ups and other event types", async () => {
    await deliver(event({ metadata: {} }));
    await deliver(event({}, "payment_intent.payment_failed"));
    expect(mem._debug.ledger.size).toBe(0);
  });
});
