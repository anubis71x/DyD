"use server";

import { auth } from "@clerk/nextjs";
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS } from "@/lib/billing/money";
import { getStripe } from "@/lib/billing/stripe";

/**
 * Start a top-up. This only creates the payment: the balance is credited by
 * the Stripe webhook (app/api/stripe/webhook) once Stripe confirms the money
 * arrived, never here.
 */
export async function createTopUp(amountCents: number): Promise<{ clientSecret: string }> {
  const { userId } = auth();
  if (!userId) throw new Error("Sign in to add funds.");
  if (!Number.isInteger(amountCents) || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    throw new Error(`Top-ups must be between $${MIN_TOPUP_CENTS / 100} and $${MAX_TOPUP_CENTS / 100}.`);
  }
  const intent = await getStripe().paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    description: "Dreampool balance top-up",
    metadata: { kind: "topup", userId },
  });
  if (!intent.client_secret) throw new Error("Couldn't start the payment. Please try again.");
  return { clientSecret: intent.client_secret };
}
