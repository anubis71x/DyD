"use client";

import { BookOpen, Home, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";
import { useIsAdmin } from "@/hooks/use-is-admin";

const NAV = [
  { href: "/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/dashboard" },
  { href: "/dashboard/narrator", label: "Campaigns", icon: BookOpen, match: (p: string) => p.startsWith("/dashboard/narrator") || p.startsWith("/dashboard/play") },
];
const ADMIN = { href: "/dashboard/admin", label: "Admin", icon: Shield, match: (p: string) => ["/dashboard/admin", "/dashboard/config", "/dashboard/token"].some((x) => p.startsWith(x)) };

/** Left rail on wide screens; a top bar on phones and tablets. */
export function Sidebar() {
  const pathname = usePathname() ?? "";
  const { isAdmin } = useIsAdmin();
  const items = isAdmin ? [...NAV, ADMIN] : NAV;

  const link = (item: (typeof NAV)[number], layout: "rail" | "bar") => {
    const active = item.match(pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={
          layout === "rail"
            ? `flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] transition-colors ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`
            : `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`
        }
      >
        <Icon className={layout === "rail" ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Main" className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col items-center gap-2 border-r border-border bg-card/60 py-5 backdrop-blur lg:flex">
        <div className="mb-6">
          <Brand compact />
        </div>
        {items.map((i) => link(i, "rail"))}
      </nav>
      <nav aria-label="Main" className="flex items-center gap-2 overflow-x-auto border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur lg:hidden">
        <Brand compact />
        <div className="ml-2 flex gap-1">{items.map((i) => link(i, "bar"))}</div>
      </nav>
    </>
  );
}
