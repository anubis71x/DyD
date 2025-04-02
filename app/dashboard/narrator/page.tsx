"use client"
import React from "react";
import NarratorList from "./components/narrator";
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { ServerGrid } from "../components/ServerGrid";
export default function page() {
  const queryClient = new QueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <div className="px-5">
        <h1 className="text-3xl font-extrabold">Select Narrator</h1>
        <span>
          {/* texto para dque el usuario seleccione un narrator para su aventura */}
          Before you start your adventure, select a narrator to guide you through the story.
        </span>
      </div>
      <main className="p-5">
        <ServerGrid />
      </main>
    </QueryClientProvider>
  );
}
