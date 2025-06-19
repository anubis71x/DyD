"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, AlertDialogDescription } from "@/components/ui/alert-dialog"
import { useIsAdmin } from "@/hooks/use-is-admin"
import { toast } from "@/hooks/use-toast"
import axios from "axios"

interface Coin {
    userId: string;
    coins: number;
    usdValue: number;
}

const fetchCoins = async () => {
    const res = await fetch("/api/token")
    if (!res.ok) throw new Error("Error al cargar points")
    return res.json()
}

const createCoin = async (data: { userId: string; coins: number; usdValue: number }) => {
    const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Error al crear point")
    return res.json()
}

const updateCoin = async (data: { userId: string; coins: number; usdValue: number }) => {
    const res = await fetch("/api/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("Error al actualizar point")
    return res.json()
}

const deleteCoin = async (userId: string) => {
    const res = await fetch("/api/token", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
    })
    if (!res.ok) throw new Error("Error al eliminar point")
    return res.json()
}

export default function PointsAdminPage() {
    const { isAdmin, isLoading: adminLoading, error: adminError } = useIsAdmin();
    const queryClient = useQueryClient();
    const { data: user, isLoading: userLoading, error: userError } = useQuery({
        queryKey: ['infouser'],
        queryFn: async () => {
            const response = await axios.get('/api/user');
            return response.data;
        },
        refetchInterval: 10000,
    });
    const { data, isLoading, error } = useQuery({ queryKey: ["points"], queryFn: fetchCoins });
    const createMutation = useMutation({
        mutationFn: createCoin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["points"] })
            toast({ title: "Point creado correctamente" })
        },
        onError: () => toast({ title: "Error al crear point", description: "Intenta de nuevo", variant: "destructive" })
    })
    const updateMutation = useMutation({
        mutationFn: updateCoin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["points"] })
            toast({ title: "Point actualizado correctamente" })
        },
        onError: () => toast({ title: "Error al actualizar point", description: "Intenta de nuevo", variant: "destructive" })
    })
    const deleteMutation = useMutation({
        mutationFn: deleteCoin,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["points"] })
            toast({ title: "Point eliminado correctamente" })
        },
        onError: () => toast({ title: "Error al eliminar point", description: "Intenta de nuevo", variant: "destructive" })
    })
    const [form, setForm] = useState({ coins: 0, usdValue: 0 });
    const [editUserId, setEditUserId] = useState<string | null>(null)
    const [deleteUserId, setDeleteUserId] = useState<string | null>(null)

    if (adminLoading) return <div>Cargando permisos...</div>
    if (adminError) return <div>Error al validar permisos</div>
    if (isLoading) return <div>Cargando points...</div>
    if (error) return <div>Error al cargar points</div>

    return (
        <Card className="max-w-2xl mx-auto mt-8 bg-zinc-900 border-zinc-800 text-white shadow-xl">
            <CardHeader>
                <CardTitle className="text-white">Administrador de Points</CardTitle>
            </CardHeader>
            <CardContent>
                <form
                    className="mb-6 flex flex-col md:flex-row gap-4"
                    onSubmit={e => {
                        e.preventDefault();
                        const userId = editUserId || user?.userId;
                        if (!userId) return toast({ title: "No se encontró el userId de sesión", variant: "destructive" });
                        if (editUserId) {
                            updateMutation.mutate({ userId, coins: form.coins, usdValue: form.usdValue });
                            setEditUserId(null);
                        } else {
                            createMutation.mutate({ userId, coins: form.coins, usdValue: form.usdValue });
                        }
                        setForm({ coins: 0, usdValue: 0 });
                    }}
                >
                    <div className="flex flex-col md:w-1/2">
                        <label htmlFor="coins" className="mb-1 text-sm font-medium text-zinc-200">Coins</label>
                        <Input
                            id="coins"
                            type="number"
                            placeholder="Coins"
                            value={form.coins}
                            onChange={e => setForm(f => ({ ...f, coins: Number(e.target.value) }))}
                            required
                            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 focus:ring-primary"
                        />
                    </div>
                    <div className="flex flex-col md:w-1/2">
                        <label htmlFor="usdValue" className="mb-1 text-sm font-medium text-zinc-200">USD Value</label>
                        <Input
                            id="usdValue"
                            type="number"
                            step="0.01"
                            placeholder="USD Value"
                            value={form.usdValue}
                            onChange={e => setForm(f => ({ ...f, usdValue: Number(e.target.value) }))}
                            required
                            className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-400 focus:ring-primary"
                        />
                    </div>
                    <div className="flex flex-col justify-end">
                        <Button type="submit" variant="default" className="mt-5 md:mt-0 bg-primary text-white hover:bg-primary/90">
                            {editUserId ? "Actualizar" : "Crear"}
                        </Button>
                        {editUserId && (
                            <Button
                                type="button"
                                variant="secondary"
                                className="mt-2 bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                                onClick={() => {
                                    setEditUserId(null);
                                    setForm({ coins: 0, usdValue: 0 });
                                }}
                            >
                                Cancelar
                            </Button>
                        )}
                    </div>
                </form>
                <Table className="bg-zinc-900 text-white border-zinc-800">
                    <TableHeader>
                        <TableRow className="bg-zinc-800">
                            <TableHead className="text-zinc-300">User ID</TableHead>
                            <TableHead className="text-zinc-300">Coins</TableHead>
                            <TableHead className="text-zinc-300">USD</TableHead>
                            <TableHead className="text-zinc-300">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data?.map((coin: Coin) => (
                            <TableRow key={coin.userId} className="hover:bg-zinc-800 border-zinc-800">
                                <TableCell className="text-zinc-200">{coin.userId}</TableCell>
                                <TableCell className="text-zinc-200">{coin.coins}</TableCell>
                                <TableCell className="text-zinc-200">${coin.usdValue.toFixed(2)}</TableCell>
                                <TableCell className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                                        onClick={() => {
                                            setEditUserId(coin.userId)
                                            setForm({ coins: coin.coins, usdValue: coin.usdValue })
                                        }}
                                    >
                                        Editar
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button size="sm" variant="destructive" className="bg-red-600 text-white hover:bg-red-700">Eliminar</Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
                                            <AlertDialogHeader>
                                                <AlertDialogTitle className="text-white">¿Eliminar transacción?</AlertDialogTitle>
                                                <AlertDialogDescription className="text-zinc-400">
                                                    Esta acción no se puede deshacer. ¿Seguro que deseas eliminar este registro de points?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel className="bg-zinc-700 text-zinc-200 hover:bg-zinc-600">Cancelar</AlertDialogCancel>
                                                <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => deleteMutation.mutate(coin.userId)}>
                                                    Eliminar
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}
