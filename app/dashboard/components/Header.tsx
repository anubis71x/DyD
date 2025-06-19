"use client"
import { User, ShoppingBasket } from "lucide-react"
import { UserButton } from "@clerk/nextjs"
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query"
import axios from "axios"
import { CoinPurchaseButton } from "./coin-purchase-button"
import {DashboardIntroModal} from "@/components/intro"
import { useState, useEffect } from "react"

export function Header() {
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = useState(false)
    const { data } = useQuery({
        queryKey: ["info"],
        queryFn: async () => {
            const response = await axios.get("/api/user")
            return response.data
        },
        refetchInterval: 10000, // Refetch cada 10 segundos (10000 ms)
    })
    console.log(data)
    useEffect(() => {
        if (data) {
            setIsOpen(data.isNewUser)
        }
    }, [data])

    return (
        <QueryClientProvider client={queryClient}>
            <DashboardIntroModal open={isOpen} onOpenChange={() => setIsOpen(!isOpen)}/>
            <div className="flex justify-between items-center xl:mb-12 py-2 px-4">
                <div className="hidden xl:flex items-center space-x-2 text-gray-400 bg-[#16171b] p-3 px-8 rounded-2xl ">
                    <span>adventurers online:</span>
                    <div className="flex items-center">
                        <User size={16} className="mr-1" />
                        <span className="font-semibold">500</span>
                    </div>
                </div>

                <div className="flex items-center space-x-3 bg-[#16171b] p-3 px-8 rounded-2xl">
                    <div className="px-2">
                        <CoinPurchaseButton/>
                    </div>
                    <div className="text-gray-400">
                        <div>
                            <h1 className="text-orange-400 text-xl">
                                {data?.availablePoints}
                            </h1>
                        </div>
                        <div className="text-sm hidden xl:block">Your Minutes</div>
                    </div>
                    <div className="w-8 h-8 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" />
                </div>

                <div className="flex items-center space-x-3">
                    <div className="text-right">
                        <div>Edit Profile</div>
                        <div className="text-sm text-gray-400">Online</div>
                    </div>
                    <div className="flex gap-4 items-center">
                        <UserButton />
                    </div>
                </div>
            </div>
        </QueryClientProvider>
    )
}
