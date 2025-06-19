"use client"
import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import { Mic, Phone } from "lucide-react"
import ReactSiriwave, { type IReactSiriwaveProps } from "react-siriwave"
import { motion, AnimatePresence } from "framer-motion"
import useVapi from "@/hooks/use-Vapi"
import useStoreCall from "@/hooks/use-store-call"
import { Badge } from "@/components/ui/badge"
import { useMutation, useQuery } from "@tanstack/react-query"
import axios from "axios"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
type CurveStyle = "ios" | "ios9"
interface SiriProps {
  theme: CurveStyle
}
const Siri: React.FC<SiriProps> = ({ theme }) => {
  const { setCallActive } = useStoreCall()
  const params = useSearchParams()
  const assistandId = params.get("i") || ''
  const router = useRouter()
  const { volumeLevel, isSessionActive, toggleCall } = useVapi(assistandId)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastDeductionTimeRef = useRef<number>(0)

  // Consulta de puntos - check the points
  const { data: points, refetch: refetchPoints } = useQuery({
    queryKey: ['points'],
    queryFn: async () => {
      const response = await axios.get("/api/user")
      return response.data.availablePoints
    },
    refetchInterval: 1000,
  })

  // Mutación para actualizar puntos
  const mutation = useMutation({
    mutationFn: async (newPoints: number) => {
      await axios.put("/api/user", { availablePoints: newPoints })
    },
    onSuccess: () => {
      refetchPoints()
    },
    onError: (error) => {
      console.error("Error al actualizar puntos:", error)
    },
  })

  // Configuracion de la onda Siri
  const [siriWaveConfig] = useState<IReactSiriwaveProps>({
    theme: theme || "ios9",
    ratio: 1,
    speed: 0.2,
    amplitude: 1,
    frequency: 6,
    color: "#fff",
    cover: false,
    width: 300,
    height: 150,
    autostart: true,
    pixelDepth: 1.2,
    lerpSpeed: 0.1,
  })

  // Manejador para alternar llamada
  const handleToggleCall = useCallback(() => {
    setCallActive(!isSessionActive)
    toggleCall()
  }, [isSessionActive, setCallActive, toggleCall])

  // Función para deducir puntos
  const deductPoints = useCallback(() => {
    const now = Date.now()
    if (now - lastDeductionTimeRef.current < 60000) return // Cambiado a 60000 ms (1 minuto)

    if (points && points >= 1) {
      const newBalance = points - 1
      console.log("🚀 ~ deductPoints ~ newBalance:", newBalance)
      mutation.mutate(newBalance)
      lastDeductionTimeRef.current = now
    } else {
      console.log("Saldo insuficiente, terminando llamada")
      handleToggleCall() // Termina la llamada
      if (intervalRef.current) {
        clearInterval(intervalRef.current) // Limpia el intervalo
        intervalRef.current = null
      }
    }
  }, [points, mutation, handleToggleCall])



  // Efecto para manejar el intervalo de deduccion - Effect to handle the deduction interval
  useEffect(() => {
    if (isSessionActive) {
      if (points === undefined || points < 1) {
        console.log("Saldo insuficiente para iniciar/mantener llamada")
        window.location.href = "/dashboard"; // Forza una recarga total
        return
      }

      deductPoints() // Deduccion inicial - Initial deduction
      intervalRef.current = setInterval(deductPoints, 60000) // Se ejecuta cada 1 minuto - Se ejecuta cada 1 minuto
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isSessionActive, points, deductPoints])



  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative overflow-hidden bg-[#16171b] border-opacity-50 p-8 rounded-3xl w-full max-w-md">
        <div className="relative z-10 flex flex-col gap-8 items-center justify-center">
          {/* Status Badge */}
          <Badge
            variant={isSessionActive ? "default" : "secondary"}
            className="mb-2"
          >
            {isSessionActive ? "Call Active" : "Ready to Call"}
          </Badge>

          {/* Wave Animation */}
          <motion.div
            className="w-full rounded-2xl overflow-hidden shadow-lg"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="p-4">
              <ReactSiriwave {...siriWaveConfig} />
            </div>
          </motion.div>

          {/* Call Button */}
          <div className="flex flex-col items-center gap-3">
            <motion.button
              onClick={handleToggleCall}
              className={`relative p-6 rounded-full transition-colors duration-200 shadow-lg ${points < 500 ? ' cursor-not-allowed' : ''}`}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              disabled={points < 1}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSessionActive ? "phone" : "mic"}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  transition={{ duration: 0.2 }}
                  className="text-white"
                >
                  {isSessionActive ? <Phone size={24} /> : <Mic size={24} />}
                </motion.div>
              </AnimatePresence>

              {/* Ring Effect */}
              {isSessionActive && (
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-red-500"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                />
              )}
            </motion.button>

            <span className="text-sm font-medium">
              {isSessionActive ? "End Call" : "Start Call"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Siri