"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";

interface AdminRecord {
  userId: string;
  isAdmin: boolean;
}

async function call(method: "POST" | "PUT" | "DELETE", body: object) {
  const res = await fetch("/api/admin", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text()) || "Request failed");
}

export default function AdminsPage() {
  const queryClient = useQueryClient();
  const { user } = useUser();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admins"],
    queryFn: async () => {
      const res = await fetch("/api/admin");
      if (!res.ok) throw new Error("Couldn't load admins");
      return (await res.json()) as AdminRecord[];
    },
  });
  const [newId, setNewId] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const mutate = useMutation({
    mutationFn: ({ method, body }: { method: "POST" | "PUT" | "DELETE"; body: object }) => call(method, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
    onError: (e: Error) => toast.error(e.message || "That didn't work"),
  });

  const add = (e: FormEvent) => {
    e.preventDefault();
    const userId = newId.trim();
    if (!userId) return;
    mutate.mutate({ method: "POST", body: { userId, isAdmin: true } }, { onSuccess: () => setNewId("") });
  };

  return (
    <section aria-labelledby="admins-h" className="flex flex-col gap-4">
      <div>
        <h2 id="admins-h" className="font-[family-name:var(--font-display)] text-2xl font-semibold">Admins</h2>
        <p className="text-sm text-muted-foreground">
          Admins can manage other admins, see billing, and edit the store catalog. Users listed in ADMIN_USER_IDS are always admins and don&apos;t appear here.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-sm">
          Clerk user id
          <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="user_2abc…" className="font-mono" />
        </label>
        <Button type="submit" disabled={!newId.trim() || mutate.isPending}>
          Add admin
        </Button>
        {user && <p className="w-full text-xs text-muted-foreground">Your user id: <span className="font-mono">{user.id}</span></p>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        {isLoading ? (
          <p className="p-4 text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="p-4 text-destructive">Couldn&apos;t load the admin list.</p>
        ) : !data?.length ? (
          <p className="p-4 text-muted-foreground">No admin records yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">User id</th>
                <th className="px-4 py-3 font-medium">Access</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((a) => {
                const self = a.userId === user?.id;
                return (
                  <tr key={a.userId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono">
                      {a.userId}
                      {self && <span className="ml-2 font-sans text-xs text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={a.isAdmin}
                          disabled={self || mutate.isPending}
                          onChange={(e) => mutate.mutate({ method: "PUT", body: { userId: a.userId, isAdmin: e.target.checked } })}
                          className="accent-[hsl(var(--primary))]"
                        />
                        {a.isAdmin ? "Admin" : "Disabled"}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {self ? null : confirming === a.userId ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-destructive">Remove?</span>
                          <Button size="sm" variant="destructive" onClick={() => mutate.mutate({ method: "DELETE", body: { userId: a.userId } }, { onSettled: () => setConfirming(null) })}>
                            Remove
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(a.userId)}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
