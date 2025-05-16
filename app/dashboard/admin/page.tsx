"use client"
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

// Definir tipo para Admin
interface Admin {
    userId: string;
    isAdmin: boolean;
}

function AdminCrud() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ["admins"], queryFn: fetchAdmins });

    const createMutation = useMutation({
        mutationFn: createAdmin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
    });
    const updateMutation = useMutation({
        mutationFn: updateAdmin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteAdmin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
    });

    const [form, setForm] = useState({ userId: "", isAdmin: false });
    const [editUserId, setEditUserId] = useState<string | null>(null);

    if (isLoading) return <div>Cargando...</div>;
    if (error) return <div>Error al cargar admins</div>;

    return (
        <div className="max-w-xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">CRUD Admins</h2>
            <form
                className="mb-4 flex gap-2"
                onSubmit={e => {
                    e.preventDefault();
                    if (editUserId) {
                        updateMutation.mutate({ userId: form.userId, isAdmin: form.isAdmin });
                        setEditUserId(null);
                    } else {
                        createMutation.mutate({ userId: form.userId, isAdmin: form.isAdmin });
                    }
                    setForm({ userId: "", isAdmin: false });
                }}
            >
                <input
                    className="border px-2 py-1"
                    placeholder="User ID"
                    value={form.userId}
                    onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                    required
                />
                <label className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={form.isAdmin}
                        onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                    />
                    Admin
                </label>
                <button className="bg-blue-500 text-white px-3 py-1 rounded" type="submit">
                    {editUserId ? "Actualizar" : "Crear"}
                </button>
                {editUserId && (
                    <button
                        type="button"
                        className="bg-gray-300 px-2 py-1 rounded"
                        onClick={() => {
                            setEditUserId(null);
                            setForm({ userId: "", isAdmin: false });
                        }}
                    >
                        Cancelar
                    </button>
                )}
            </form>
            <table className="w-full border">
                <thead>
                    <tr>
                        <th className="border px-2">User ID</th>
                        <th className="border px-2">Admin</th>
                        <th className="border px-2">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.map((admin: Admin) => (
                        <tr key={admin.userId}>
                            <td className="border px-2">{admin.userId}</td>
                            <td className="border px-2">{admin.isAdmin ? "Sí" : "No"}</td>
                            <td className="border px-2 flex gap-2">
                                <button
                                    type="button"
                                    className="bg-yellow-400 px-2 py-1 rounded"
                                    onClick={() => {
                                        setEditUserId(admin.userId);
                                        setForm({ userId: admin.userId, isAdmin: admin.isAdmin });
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    className="bg-red-500 text-white px-2 py-1 rounded"
                                    onClick={() => deleteMutation.mutate(admin.userId)}
                                >
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
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
