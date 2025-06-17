"use client"
import type React from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface Admin {
    userId: string;
    isAdmin: boolean;
}

const fetchAdmins = async () => {
    const res = await fetch("/api/admin");
    if (!res.ok) throw new Error("Error al cargar admins");
    return res.json();
};

const createAdmin = async (data: { userId: string; isAdmin: boolean }) => {
    const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Error al crear admin");
    return res.json();
};

const updateAdmin = async (data: { userId: string; isAdmin: boolean }) => {
    const res = await fetch("/api/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Error al actualizar admin");
    return res.json();
};

const deleteAdmin = async (userId: string) => {
    const res = await fetch("/api/admin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error("Error al eliminar admin");
    return res.json();
};

function AdminCrud() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ["admins"], queryFn: fetchAdmins });

    const createMutation = useMutation({
        mutationFn: createAdmin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admins"] });
            toast({ title: "Admin creado correctamente" });
        },
        onError: () => toast({ title: "Error al crear admin", variant: "destructive" }),
    });
    const updateMutation = useMutation({
        mutationFn: updateAdmin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admins"] });
            toast({ title: "Admin actualizado" });
        },
        onError: () => toast({ title: "Error al actualizar admin", variant: "destructive" }),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteAdmin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admins"] });
            toast({ title: "Admin eliminado" });
        },
        onError: () => toast({ title: "Error al eliminar admin", variant: "destructive" }),
    });

    const [form, setForm] = useState({ userId: "", isAdmin: false });
    const [open, setOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);

    const handleEdit = (admin: Admin) => {
        setForm({ userId: admin.userId, isAdmin: admin.isAdmin });
        setEditMode(true);
        setOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editMode) {
            updateMutation.mutate(form);
        } else {
            createMutation.mutate(form);
        }
        setForm({ userId: "", isAdmin: false });
        setEditMode(false);
        setOpen(false);
    };

    if (isLoading) return <div className="text-center py-8">Loading...</div>;
    if (error) return <div className="text-center py-8 text-red-500">Error loading admins</div>;

    return (
        <Card className="max-w-2xl mx-auto mt-8 p-4 shadow-lg bg-zinc-900 border-zinc-800 text-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-2xl font-bold text-white">Admins</h2>
                <Button onClick={() => { setOpen(true); setEditMode(false); setForm({ userId: "", isAdmin: false }); }} className="bg-primary text-white hover:bg-primary/90">
                    New Admin
                </Button>
            </div>
            <div className="overflow-x-auto">
                <Table className="bg-zinc-900 text-white border-zinc-800">
                    <TableHeader>
                        <TableRow className="bg-zinc-800">
                            <TableCell className="text-zinc-300">User ID</TableCell>
                            <TableCell className="text-zinc-300">Admin</TableCell>
                            <TableCell className="text-zinc-300">Actions</TableCell>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data?.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-zinc-400">There are no admins</TableCell>
                            </TableRow>
                        )}
                        {data?.map((admin: Admin) => (
                            <TableRow key={admin.userId} className="hover:bg-zinc-800 border-zinc-800">
                                <TableCell className="text-zinc-200">{admin.userId}</TableCell>
                                <TableCell className="text-zinc-200">{admin.isAdmin ? "Yes" : "No"}</TableCell>
                                <TableCell className="flex gap-2">
                                    <Button size="sm" variant="outline" className="bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border-zinc-600" onClick={() => handleEdit(admin)}>
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteMutation.mutate(admin.userId)}>
                                        Delete
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm w-full bg-zinc-900 border-zinc-800 text-white">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle className="text-white">{editMode ? "Editar admin" : "Nuevo admin"}</DialogTitle>
                        </DialogHeader>
                        <Input
                            placeholder="User ID"
                            value={form.userId}
                            onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                            required
                            disabled={editMode}
                            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 focus:ring-primary"
                        />
                        <label className="flex items-center gap-2 text-zinc-200">
                            <input
                                type="checkbox"
                                checked={form.isAdmin}
                                onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                                className="accent-primary bg-zinc-800 border-zinc-700"
                            />
                            Admin
                        </label>
                        <DialogFooter>
                            <Button type="submit" className="w-full bg-primary text-white hover:bg-primary/90">
                                {editMode ? "Update" : "Create"}
                            </Button>
                            <DialogClose asChild>
                                <Button type="button" variant="outline" className="w-full mt-2 bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border-zinc-600" onClick={() => setOpen(false)}>
                                    Cancel
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

const queryClient = new QueryClient();

export default function AdminPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <AdminCrud />
        </QueryClientProvider>
    );
}
