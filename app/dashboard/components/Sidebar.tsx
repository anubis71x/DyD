"use client"
import { User, Home, Grid, Settings, FileText, BookMarkedIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import axios from "axios"
export function Sidebar() {
    const { data } = useQuery({
        queryKey: ['infouser'],
        queryFn: async () => {
            const response = await axios.get('/api/user');
            return response.data;
        },
        refetchInterval: 10000,
        staleTime: 1000 * 60 * 5 // 5 minutos
    })

    const { data: adminData, isLoading: adminLoading, error: adminError } = useQuery({
        queryKey: ['isAdmin'],
        queryFn: async () => {
            const res = await axios.get('/api/admin');
            return res.data;
        },
    });
    console.log("🚀 ~ Sidebar ~ adminData:", adminData)

    const [activeButton, setActiveButton] = useState('home')
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        // Mapeo de rutas a botones
        const routeToButton = {
            '/dashboard': 'home',
            '/dashboard/narrator': 'grid',
            '/dashboard/settings': 'settings',
            '/dashboard/notes': 'fileText'
        }

        // Encuentra el botón correspondiente a la ruta actual
        const currentButton = routeToButton[pathname as keyof typeof routeToButton]
        if (currentButton) {
            setActiveButton(currentButton)
        }
    }, [pathname])

    return (
        <div className="w-24 bg-[#1A1A20]/80 hidden xl:flex  flex-col items-center py-6 space-y-8 ">
            <div className="text-purple-500 text-2xl font-bold mb-8">DP</div>

            <button
                className={`p-3 rounded-full ${activeButton === 'home' ? 'bg-[#2A2A35]' : ''} text-gray-400 hover:text-white`}
                type="button"
                onClick={() => {
                    setActiveButton('home')
                    router.push('/dashboard')
                }}
            >
                <Home size={24} />
            </button>

            <button
                className={`p-3 rounded-full ${activeButton === 'grid' ? 'bg-[#2A2A35]' : ''} text-gray-400 hover:text-white`}
                type="button"
                onClick={() => {
                    setActiveButton('grid')
                    router.push('/dashboard/narrator')
                }}
            >
                <BookMarkedIcon size={24} />
            </button>
            {/* biome-ignore lint/suspicious/noExplicitAny: <explanation> */}
            {adminData?.find((item: any) => item.userId === data?.userId) && (

                <button
                    className={`p-3 rounded-full ${activeButton === 'settings' ? 'bg-[#2A2A35]' : ''} text-gray-400 hover:text-white`}
                    type="button"
                    onClick={() => {
                        setActiveButton('settings')
                        router.push('/dashboard/config')
                    }}
                >
                    <Settings size={24} />
                </button>
            )}

            <div className="flex-grow" />

            <button
                className={`p-3 rounded-full ${activeButton === 'fileText' ? 'bg-[#2A2A35]' : ''} text-gray-400 hover:text-white`}
                type="button"
                disabled={true}
                onClick={() => setActiveButton('fileText')}
            >
                <FileText size={24} />
            </button>
        </div>
    )
}