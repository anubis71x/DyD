import type { Metadata } from "next";
import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Brand } from "@/components/brand";
import GoogleTag from "@/components/GoogleTag";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { bodyFont, displayFont } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Sign in · Dreampool",
  description: "Sign in to Dreampool to continue your adventures.",
};

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className="dark">
        <head>
          <GoogleTag />
        </head>
        <body className={`${bodyFont.variable} ${displayFont.variable} dp-night font-[family-name:var(--font-body)] text-foreground antialiased`}>
          <div className="grid min-h-screen lg:grid-cols-2">
            <aside className="hidden flex-col justify-between border-r border-border bg-card/40 p-10 lg:flex">
              <Brand href="/" />
              <div className="max-w-md">
                <p className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
                  “The door was never locked, traveler. It was waiting.”
                </p>
                <p className="mt-3 text-muted-foreground">Eldrath Shadowweaver, one of your storytellers</p>
              </div>
              <p className="text-sm text-muted-foreground">Your stories save as you play. Pick up where you left off on any device.</p>
            </aside>
            <main className="flex flex-col items-center justify-center gap-8 px-5 py-12">
              <div className="lg:hidden">
                <Brand href="/" />
              </div>
              {children}
            </main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
