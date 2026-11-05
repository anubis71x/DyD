"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";

const TABS = [
  { href: "/dashboard/admin", label: "Admins" },
  { href: "/dashboard/admin/billing", label: "Billing" },
  { href: "/dashboard/admin/feedback", label: "Feedback" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) return <p className="px-5 pt-8 text-muted-foreground">Checking access…</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-5 pt-12">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Admins only</h1>
        <p className="mt-2 text-muted-foreground">
          This area is for Dreampool admins. If you should have access, ask an admin to add you, or add your Clerk user id to ADMIN_USER_IDS.
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold">Admin</h1>
        <nav aria-label="Admin sections" className="inline-flex rounded-full border border-border bg-card p-1">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
