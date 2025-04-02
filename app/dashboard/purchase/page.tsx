"use client"
import React from "react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import CurrencyTransfer from "@/components/succesPurchase";
export default function page() {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
    <main className="h-screen flex justify-center ">
    <CurrencyTransfer/>
    </main>
    </QueryClientProvider>
  );
}
