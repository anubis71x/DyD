"use client"
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Definir tipo para Coin
interface Coin {
    userId: string;
    coins: number;
    usdValue: number;
}

const fetchCoins = async () => {
    const res = await fetch("/api/token");
    if (!res.ok) throw new Error("Error al cargar coins");
    return res.json();
};

const createCoin = async (data: { userId: string; coins: number; usdValue: number }) => {
    const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Error al crear coin");
    return res.json();
};

const updateCoin = async (data: { userId: string; coins: number; usdValue: number }) => {
    const res = await fetch("/api/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Error al actualizar coin");
    return res.json();
};

const deleteCoin = async (userId: string) => {
    const res = await fetch("/api/token", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error("Error al eliminar coin");
    return res.json();
};

function CoinCrud() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ["coins"], queryFn: fetchCoins });

    const createMutation = useMutation({
        mutationFn: createCoin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coins"] }),
    });
    const updateMutation = useMutation({
        mutationFn: updateCoin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coins"] }),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteCoin,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coins"] }),
    });

    const [form, setForm] = useState({ userId: "", coins: 0, usdValue: 0 });
    const [editUserId, setEditUserId] = useState<string | null>(null);

    if (isLoading) return <div>Cargando...</div>;
    if (error) return <div>Error al cargar coins</div>;

    return (
        <div className="max-w-xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">CRUD Coins</h2>
            <form
                className="mb-4 flex gap-2"
                onSubmit={e => {
                    e.preventDefault();
                    if (editUserId) {
                        updateMutation.mutate({ userId: form.userId, coins: form.coins, usdValue: form.usdValue });
                        setEditUserId(null);
                    } else {
                        createMutation.mutate({ userId: form.userId, coins: form.coins, usdValue: form.usdValue });
                    }
                    setForm({ userId: "", coins: 0, usdValue: 0 });
                }}
            >
                {/* <input
                    className="border px-2 py-1"
                    placeholder="User ID"
                    value={form.userId}
                    onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                    required
                /> */}
                <input
                    className="border px-2 py-1"
                    type="number"
                    placeholder="Coins"
                    value={form.coins}
                    onChange={e => setForm(f => ({ ...f, coins: Number(e.target.value) }))}
                    required
                />
                <input
                    className="border px-2 py-1"
                    type="number"

                    placeholder="USD Value"
                    value={form.usdValue}
                    onChange={e => setForm(f => ({ ...f, usdValue: Number(e.target.value) }))}
                    required
                />
                <button className="bg-blue-500 text-white px-3 py-1 rounded" type="submit">
                    {editUserId ? "Actualizar" : "Crear"}
                </button>
                {editUserId && (
                    <button
                        type="button"
                        className="bg-gray-300 px-2 py-1 rounded"
                        onClick={() => {
                            setEditUserId(null);
                            setForm({ userId: "", coins: 0, usdValue: 0 });
                        }}
                    >
                        Cancelar
                    </button>
                )}
            </form>
            <table className="w-full border">
                <thead>
                    <tr>
                        <th className="border px-2">Coins</th>
                        <th className="border px-2">USD</th>
                        <th className="border px-2">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {data?.map((coin: Coin) => (
                        <tr key={coin.userId}>
                            <td className="border px-2">{coin.coins}</td>
                            <td className="border px-2">${coin.usdValue.toFixed(2)}</td>
                            <td className="border px-2 flex gap-2">
                                <button
                                    type="button"
                                    className="bg-yellow-400 px-2 py-1 rounded"
                                    onClick={() => {
                                        setEditUserId(coin.userId);
                                        setForm({ userId: coin.userId, coins: coin.coins, usdValue: coin.usdValue });
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    className="bg-red-500 text-white px-2 py-1 rounded"
                                    onClick={() => deleteMutation.mutate(coin.userId)}
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

export default function TokenPage() {
    return (
        <QueryClientProvider client={queryClient}>
            <CoinCrud />
        </QueryClientProvider>
    );
}
