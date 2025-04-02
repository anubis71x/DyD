"use client"

import type React from "react"

import { useState } from "react"
import { useStripe, useElements, CardElement } from "@stripe/react-stripe-js"
import { Button } from "@/components/ui/button"
import { createPaymentIntent } from "../action"

export function CheckoutForm({ packageId }: { packageId: string }) {
    const stripe = useStripe()
    const elements = useElements()
    const [error, setError] = useState<string | null>(null)
    const [processing, setProcessing] = useState(false)
    const [succeeded, setSucceeded] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!stripe || !elements) {
            setError("Stripe has not been properly initialized")
            return
        }

        setProcessing(true)

        try {
            // In a real application, you would create a payment intent on the server
            // and return the client secret
            const { clientSecret } = await createPaymentIntent(packageId)
            const client = clientSecret || ''
            const cardElement = elements.getElement(CardElement)

            if (!cardElement) {
                throw new Error("Card element not found")
            }

            const { error, paymentIntent } = await stripe.confirmCardPayment(client, {
                payment_method: {
                    card: cardElement,
                },
            })

            if (error) {
                setError(error.message || "An error occurred")
                setProcessing(false)
            } else if (paymentIntent.status === "succeeded") {
                setSucceeded(true)
                window.location.reload()
                setProcessing(false)
            }
        } catch (err: any) {
            console.error("Payment error:", err)
            setError(err?.message || "An error occurred while processing your payment")
            setProcessing(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="mb-6">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
                <label className="block text-sm font-medium text-slate-700 mb-2">Card Details</label>
                <div className="border rounded-md p-3 bg-white">
                    <CardElement
                        options={{
                            style: {
                                base: {
                                    fontSize: "16px",
                                    color: "#424770",
                                    "::placeholder": {
                                        color: "#aab7c4",
                                    },
                                },
                                invalid: {
                                    color: "#9e2146",
                                },
                            },
                        }}
                    />
                </div>
            </div>

            {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

            {succeeded ? (
                <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-md mb-4">
                    Payment successful! Your coins have been added to your account.
                </div>
            ) : (
                <Button type="submit" disabled={!stripe || processing} className="w-full py-6">
                    {processing ? "Processing..." : "Pay Now"}
                </Button>
            )}
        </form>
    )
}

