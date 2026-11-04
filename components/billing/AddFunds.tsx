"use client";

import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createTopUp } from "@/app/dashboard/action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS, TOPUP_PRESETS_CENTS } from "@/lib/billing/money";
import { MARKUP } from "@/lib/billing/pricing";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null;
const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

function PayForm({ amountCents, onPaid }: { amountCents: number; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const card = elements?.getElement(CardElement);
    if (!stripe || !card) {
      setError("The payment form hasn't loaded yet. Try again in a moment.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const { clientSecret } = await createTopUp(amountCents);
      const { error: payError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } });
      if (payError) setError(payError.message ?? "The payment didn't go through.");
      else if (paymentIntent?.status === "succeeded") onPaid();
      else setError("The payment is still processing. Your balance updates once it completes.");
    } catch (err) {
      setError((err as Error).message || "Something went wrong starting the payment.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        Card details
        <div className="rounded-md border bg-white p-3">
          <CardElement options={{ style: { base: { fontSize: "16px", color: "#424770", "::placeholder": { color: "#aab7c4" } }, invalid: { color: "#9e2146" } } }} />
        </div>
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!stripe || processing} className="w-full py-6">
        {processing ? "Processing…" : `Pay ${dollars(amountCents)}`}
      </Button>
    </form>
  );
}

export function AddFundsDialog({ open, onClose, onFunded }: { open: boolean; onClose: () => void; onFunded?: () => void }) {
  const [amountCents, setAmountCents] = useState(1000);
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState<"amount" | "pay" | "done">("amount");

  const customCents = custom ? Math.round(Number(custom) * 100) : NaN;
  const chosen = custom ? customCents : amountCents;
  const valid = Number.isInteger(chosen) && chosen >= MIN_TOPUP_CENTS && chosen <= MAX_TOPUP_CENTS;

  const close = () => {
    setStep("amount");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="bg-white text-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-2xl font-bold">
            <Wallet className="h-6 w-6" /> Add funds
          </DialogTitle>
        </DialogHeader>

        {step === "amount" && (
          <div className="flex flex-col gap-4">
            <p className="text-center text-sm text-slate-600">
              Each turn is charged at what it costs us to run plus {Math.round(MARKUP * 100)}%. Most Haiku turns cost well under a cent.
            </p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Amount">
              {TOPUP_PRESETS_CENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={!custom && amountCents === c}
                  onClick={() => {
                    setCustom("");
                    setAmountCents(c);
                  }}
                  className={`rounded-lg border py-3 text-lg font-semibold ${!custom && amountCents === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-900 hover:border-slate-400"}`}
                >
                  {dollars(c)}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Other amount
              <span className="flex items-center rounded-md border px-2">
                $
                <input
                  type="number"
                  inputMode="decimal"
                  min={MIN_TOPUP_CENTS / 100}
                  max={MAX_TOPUP_CENTS / 100}
                  step="0.01"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="w-24 bg-transparent py-1.5 outline-none"
                  placeholder={(MIN_TOPUP_CENTS / 100).toFixed(2)}
                />
              </span>
            </label>
            {!valid && <p className="text-sm text-red-600">Choose an amount between {dollars(MIN_TOPUP_CENTS)} and {dollars(MAX_TOPUP_CENTS)}.</p>}
            <Button type="button" disabled={!valid || !stripePromise} onClick={() => setStep("pay")} className="py-6">
              Continue with {valid ? dollars(chosen) : "…"}
            </Button>
            {!stripePromise && <p className="text-sm text-red-600">Payments aren&apos;t configured yet (missing Stripe publishable key).</p>}
          </div>
        )}

        {step === "pay" && stripePromise && (
          <Elements stripe={stripePromise}>
            <button type="button" onClick={() => setStep("amount")} className="mb-2 text-sm text-slate-600 hover:text-slate-900">
              ← Change amount
            </button>
            <PayForm
              amountCents={chosen}
              onPaid={() => {
                setStep("done");
                onFunded?.();
              }}
            />
          </Elements>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-4 text-center">
            <p className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800">
              Payment received. {dollars(chosen)} will appear in your balance within a few seconds.
            </p>
            <Button type="button" onClick={close}>Back to the story</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddFundsButton({ onFunded }: { onFunded?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="flex items-center px-3 py-2 text-sm xl:px-6 xl:py-6 xl:text-lg">
        <Wallet className="h-5 w-5 sm:mr-2" />
        <span className="hidden sm:inline">Add funds</span>
      </Button>
      <AddFundsDialog open={open} onClose={() => setOpen(false)} onFunded={onFunded} />
    </>
  );
}
