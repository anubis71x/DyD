import type { Metadata } from "next";
import { Inter } from 'next/font/google';
import "@/app/globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Sidebar } from "./components/Sidebar";
import { ToasterProvider } from "@/lib/ToasterProvider";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import QueryProvider from "./queryProvider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BackgroundEffect } from "./components/background-effect";
import AdSense from "@/components/AdSense";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dreampool - Dashboard",
  description: "Dreampool - Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <AdSense />
        </head>
        <body className={inter.className}>
          <ToasterProvider />
          <QueryProvider>
            {/* Fondo animado con temática D&D */}
            <BackgroundEffect />
            {/* Contenedor principal */}
            <div className="flex max-lg:flex-col min-h-screen h-full text-grey-1 overflow-y-auto relative z-10">
              <Sidebar />
              {/* Contenedor del contenido principal */}
              <div className="flex-1 min-h-screen h-full text-white font-sans backdrop-blur-sm bg-black/20">
                {/* Control vertical */}
                <div className="flex flex-col h-full">
                  <Header />
                  {/* Main con contenido */}
                  <main className="flex-1 py-6 overflow-y-auto">
                    {children}
                  </main>
                </div>
              </div>
            </div>
          </QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
