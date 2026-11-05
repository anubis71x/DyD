import type { Metadata } from "next";
import "@/app/globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import AdSense from "@/components/AdSense";
import { bodyFont, displayFont } from "@/lib/fonts";
import { ToasterProvider } from "@/lib/ToasterProvider";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import QueryProvider from "./queryProvider";

export const metadata: Metadata = {
  title: "Dreampool",
  description: "Solo tabletop adventures told by an AI storyteller.",
};

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <head>
          <AdSense />
        </head>
        <body className={`${bodyFont.variable} ${displayFont.variable} dp-night font-[family-name:var(--font-body)] text-foreground antialiased`}>
          <ToasterProvider />
          <QueryProvider>
            <div className="flex min-h-screen flex-col lg:flex-row">
              <Sidebar />
              <div className="flex min-w-0 flex-1 flex-col">
                <Header />
                <main className="flex-1 pb-8">{children}</main>
              </div>
            </div>
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
