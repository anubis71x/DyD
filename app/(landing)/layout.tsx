import type { Metadata } from "next";
import type React from "react";
import "@/app/globals.css";
import GoogleTag from "@/components/GoogleTag";
import { bodyFont, displayFont } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Dreampool · Solo adventures with an AI storyteller",
  description:
    "Pick a storyteller, create a character by talking, and play a tabletop-style adventure that remembers everything. Pay only for what you play.",
  openGraph: { type: "website", siteName: "Dreampool", url: "/" },
  twitter: { card: "summary_large_image" },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <GoogleTag withConversions />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} dp-night font-[family-name:var(--font-body)] text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
