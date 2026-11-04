import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { centsToMicros } from "@/lib/billing/money";
import { getStripe } from "@/lib/billing/stripe";
import { getMongoStores } from "@/lib/save/mongoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe webhook. Public (see middleware.ts) but every request must carry a
 * valid Stripe signature. Credits a top-up exactly once per PaymentIntent:
 * the ledger refId is the intent id, so retries and replays are no-ops.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const { kind, userId } = intent.metadata ?? {};
    if (kind === "topup" && userId && intent.currency === "usd" && intent.amount_received > 0) {
      const stores = await getMongoStores();
      const result = await stores.wallet.post({
        refId: `topup:${intent.id}`,
        userId,
        amountMicros: centsToMicros(intent.amount_received),
        kind: "topup",
        meta: { paymentIntent: intent.id, amountCents: intent.amount_received, stripeEvent: event.id },
      });
      console.log(`[stripe_webhook] top-up ${intent.id} for ${userId}: ${result}`);
    }
  }

  // Acknowledge everything else so Stripe doesn't retry events we ignore.
  return NextResponse.json({ received: true });
}
