"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DialogContent } from "./ui/dialog";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const COIN_OPTIONS = [
  { value: "3", label: "3 Minutes", usd: 0.5 },
  { value: "6", label: "6 Minutes", usd: 1 },
  { value: "12", label: "12 Minutes", usd: 2 },
  { value: "60", label: "60 Minutes", usd: 10 },
  { value: "120", label: "100,000 Minutes", usd: 20 },
];

export default function CoinPurchase() {
  const [selectedCoins, setSelectedCoins] = useState(COIN_OPTIONS[0]);
  const [isLoading, setIsLoading] = useState(false);

  const handleCoinSelection = (value: string) => {
    const selected = COIN_OPTIONS.find((option) => option.value === value);
    if (selected) {
      setSelectedCoins(selected);
    }
  };

  const handleCheckout = async () => {
    setIsLoading(true);
    const stripe = await stripePromise;

    // Call your backend to create a Checkout Session
    const response = await fetch("/api/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: selectedCoins.usd * 100, // Stripe uses cents
        currency: "usd",
      }),
    });

    const session = await response.json();

    // Redirect to Stripe Checkout
    const result = await stripe!.redirectToCheckout({
      sessionId: session.id,
    });

    if (result.error) {
      console.error(result.error.message);
    }

    setIsLoading(false);
  };

  return (
    <DialogContent  >
      <div className="w-full max-w-md mx-auto ">
      <CardHeader>
        <CardTitle>Buy Coins</CardTitle>
        <CardDescription>1M coins = 1000P = 0.2USD</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
        <div>
          <label
          htmlFor="coin-select"
          className="block text-sm font-medium text-gray-700 mb-1"
          >
          Select the amount of coins
          </label>
          <Select
          onValueChange={handleCoinSelection}
          defaultValue={selectedCoins.value}
          >
          <SelectTrigger id="coin-select">
            <SelectValue placeholder="Select coins" />
          </SelectTrigger>
          <SelectContent>
            {COIN_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
            ))}
          </SelectContent>
          </Select>
        </div>
        <div className="bg-gray-100 p-4 rounded-md">
          <p className="text-sm font-medium text-gray-900">
          Purchase summary:
          </p>
          <p className="text-sm text-gray-600">{selectedCoins.label}</p>
          <p className="text-sm text-gray-600">
          </p>
          <p className="text-sm font-bold text-gray-900">
          {selectedCoins.usd.toFixed(2)} USD
          </p>
        </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
        className="w-full"
        onClick={handleCheckout}
        disabled={isLoading}
        >
        {isLoading ? "Processing..." : "Buy with Stripe"}
        </Button>
      </CardFooter>
      </div>
    </DialogContent>
  );
}
