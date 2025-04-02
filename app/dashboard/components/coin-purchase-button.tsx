"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CoinPurchaseModal } from "./coin-purchase-modal"
import { Coins, ShoppingCart } from "lucide-react"

export function CoinPurchaseButton() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button 
        onClick={() => setIsModalOpen(true)} 
        className="xl:px-6 xl:py-6 xl:text-lg px-3 py-2 text-sm flex items-center"
      >
        <Coins className="mr-2 h-5 w-5 hidden sm:block" /> {/* Moneda en pantallas grandes */}
        <ShoppingCart className="h-5 w-5 sm:hidden" /> {/* Carrito en móviles */}
        <span className="hidden sm:inline">Buy Coins</span> {/* Texto solo en pantallas grandes */}
      </Button>
      <CoinPurchaseModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
