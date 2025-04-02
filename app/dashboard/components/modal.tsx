"use client"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { CheckoutForm } from "./checkout-form"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CoinPackage } from "./coin-package"
import { Coins } from "lucide-react"

// Initialize Stripe with your publishable key
// Make sure to check if the key exists
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

const coinPackages = [
  { id: "1000_coins", amount: 1000, price: 9.99, popular: false },
  { id: "2000_coins", amount: 2000, price: 17.99, popular: true },
  { id: "5000_coins", amount: 5000, price: 39.99, popular: false },
]

export function CoinPurchaseModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [selectedPackage, setSelectedPackage] = useState<(typeof coinPackages)[0] | null>(null)
  const [isCheckout, setIsCheckout] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)

  const handlePackageSelect = (pkg: (typeof coinPackages)[0]) => {
    if (!stripePromise) {
      setStripeError("Stripe is not properly configured. Please check your environment variables.")
      return
    }

    setSelectedPackage(pkg)
    setIsCheckout(true)
    setStripeError(null)
  }

  const handleBack = () => {
    setIsCheckout(false)
    setStripeError(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center text-2xl font-bold">
            <Coins className="mr-2 h-6 w-6 text-yellow-500" />
            {isCheckout ? "Complete Your Purchase" : "Purchase Coins"}
          </DialogTitle>
        </DialogHeader>

        {stripeError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">{stripeError}</div>
        )}

        {!isCheckout ? (
          <div className="grid gap-4 py-4">
            <p className="text-center text-slate-600 mb-2">Select a coin package to purchase</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {coinPackages.map((pkg) => (
                <CoinPackage key={pkg.id} package={pkg} onSelect={() => handlePackageSelect(pkg)} />
              ))}
            </div>
          </div>
        ) : stripePromise ? (
          <Elements stripe={stripePromise}>
            <div className="mb-4">
              <button onClick={handleBack} className="text-sm text-slate-600 hover:text-slate-900 flex items-center" type="button">
                ← Back to packages
              </button>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Coins className="h-5 w-5 text-yellow-500 mr-2" />
                  <span className="font-medium">{selectedPackage?.amount} Coins</span>
                </div>
                <span className="font-bold">${selectedPackage?.price}</span>
              </div>
            </div>
            <CheckoutForm packageId={selectedPackage?.id || ""} />
          </Elements>
        ) : (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
            Stripe is not properly configured. Please check your environment variables.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

