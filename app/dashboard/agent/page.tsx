"use client"
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Siri from "@/components/siri";
export default function page() {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <main className="container mx-auto p-4">
        <Siri theme="ios9" />
      </main>
    </QueryClientProvider>
  );
}