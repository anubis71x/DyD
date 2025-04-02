"use client";
import { useState, useEffect } from "react";
import { Coins } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import useStoreCall from "@/hooks/use-store-call";

export default function CoinMeter() {
  const { callActive } = useStoreCall();
  const { data, refetch } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const response = await axios.get("/api/user");
      return response.data;
    },
  });

  // Asegúrate de que coins se inicializa con los puntos disponibles
  const [coins, setCoins] = useState(data ? data.availablePoints : 0);
  const [minutes, setMinutes] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  const coinsPerMinute = 1000;

  // Mutation para actualizar los puntos del usuario
  const mutation = useMutation({
    mutationFn: async (updatedCoins: number) => {
      await axios.put("/api/user", { availablePoints: updatedCoins });
    },
    onError: (error) => {
      console.error("Error updating points:", error);
    },
    onSuccess: (data) => {
      console.log("Points updated successfully:", data);

      refetch()
    },
  });

  useEffect(() => {
    // Solo correr el intervalo si los puntos están disponibles
    if (data) {
      setCoins(data.availablePoints);
    }

    let interval: NodeJS.Timeout | null = null;

    if (isRunning) {
      interval = setInterval(() => {
        setCoins((prevCoins: number) => {
          const newCoins = prevCoins - 500; // Restamos 500 puntos cada 30 segundos

          // Si newCoins llega a 0 o menos, detenemos el contador
          if (newCoins <= 0) {
            setIsRunning(false); // Detenemos el contador
            clearInterval(interval!); // Limpiamos el intervalo
            mutation.mutate(0); // Aseguramos que los puntos queden en 0
            return 0;
          }

          mutation.mutate(newCoins); // Actualiza el valor en la base de datos
          return newCoins;
        });
        setMinutes((prevMinutes) => prevMinutes + 1); // Aumentamos 1 minuto
      }, 30000);
    } else if (interval) {
      clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, mutation, data]);
  useEffect(() => {
    if (callActive) {
      setIsStarted(true);
      setIsRunning(true);
    }
  }, [callActive]);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  return (
    <div className="flex flex-col items-center space-y-4 w-[300px] p-2">
      <div>
        {data && data.availablePoints === 0 && (
          <div>
            <span className="text-red-400 text-center">You no have Points, please purchase more Points</span>
          </div>
        )}
      </div>
      {isStarted ? (
        <>
          <div className="text-4xl font-bold text-yellow-500">
            {coins} <Coins className="inline-block ml-2" />
          </div>
          <div className="text-xl text-gray-600">
            {minutes.toFixed(2)} minutos
          </div>

          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-yellow-500 h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${((coins % coinsPerMinute) / coinsPerMinute) * 100}%`,
              }}
            ></div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center space-y-4 border w-full rounded-lg py-4">
          <h1 className="font-semibold text-xl">You have </h1>
          <h2>
            <Coins className="inline-block text-yellow-500" />
            <span className="text-2xl">{coins}</span>
          </h2>
        </div>
      )}
    </div>
  );
}
