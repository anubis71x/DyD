import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Vapi from "@vapi-ai/web";

const useVapi = ( assistantId: string) => {
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "";

  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [conversation, setConversation] = useState<{ role: string; text: string }[]>([]);
  const vapiRef = useRef<any>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const sessionInitialized = useRef(false);

  /** 📌 Sincronizar `sessionIdRef` con `sessionId` */
  useEffect(() => {
    if (sessionId) {
      sessionIdRef.current = sessionId;
      console.log("🔄 sessionIdRef actualizado:", sessionIdRef.current);
    }
  }, [sessionId]);

  /** 📌 Obtener la sesión activa del usuario */
  const fetchUserSessions = async () => {
    try {
      const response = await fetch(`/api/sessions`, { method: "GET" });
      const data = await response.json();

      if (data.length > 0) {
        console.log("✅ User session found:", data[0]._id);
        setKnowledgeBaseId(data[0].knowledgeBaseId || null); // 🔄 Guardar KB ID
        return data[0]._id;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user sessions:", error);
      return null;
    }
  };

  /** 📌 Crear una nueva sesión si no hay ninguna */
  const createSession = async () => {
    try {
      const response = await fetch(`/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: "New Campaign"
        })
      });

      const data = await response.json();
      console.log("✅ New session created:", data);
      setKnowledgeBaseId(data.knowledgeBaseId || null); // 🔄 Guardar KB ID

      return data.sessionId ?? null;
    } catch (error) {
      console.error("Error creating session:", error);
      return null;
    }
  };

  /** 📌 Cargar datos de la sesión desde MongoDB */
  const fetchSessionData = async (id: string) => {
    try {
      const response = await fetch(`/api/sessionData?sessionId=${id}`);
      const data = await response.json();
      console.log("✅ Fetched session data:", data);
      setSessionData(data);
      setKnowledgeBaseId(data.session?.knowledgeBaseId || null); // 🔄 Actualizar KB ID si es necesario
    } catch (error) {
      console.error("Error fetching session data:", error);
      setSessionData(null);
    }
  };

  /** 📌 Inicializar Vapi */
  const initializeVapi = useCallback(() => {
    if (!vapiRef.current) {
      const vapiInstance = new Vapi(publicKey);
      vapiRef.current = vapiInstance;

      vapiInstance.on("call-start", () => {
        setIsSessionActive(true);
        console.log("📞 Call started");
      });

      vapiInstance.on("call-end", async () => {
        console.log("📞 Call ended");
        console.log("🔄 Actualizando sessionData al terminar la sesión...");

        if (sessionIdRef.current) {
          await fetchSessionData(sessionIdRef.current);
        } else {
          console.log("⚠ No hay sessionId en sessionIdRef, no se pudo actualizar sessionData.");
        }

        setIsSessionActive(false);
        setConversation([]);
      });

      vapiInstance.on("volume-level", (volume: number) => {
        setVolumeLevel(volume);
      });

      vapiInstance.on("message", (message: any) => {
        if (message.type === "transcript" && message.transcriptType === "final") {
          setConversation((prev) => [...prev, { role: message.role, text: message.transcript }]);
        }
      });

      vapiInstance.on("error", (e: Error) => {
        console.error("Vapi error:", e);
      });
    }
  }, [sessionId]);

  /** 📌 Iniciar o detener la llamada con Vapi */
  const toggleCall = async () => {
    try {
      if (isSessionActive) {
        await vapiRef.current.stop();
      } else {
        let id = sessionId;
        if (!id) {
          console.log("❌ No session found, creating a new one...");
          id = await createSession();
          if (!id) return;
          setSessionId(id);
          sessionIdRef.current = id;
          await fetchSessionData(id);
        }else{
          sessionIdRef.current = id;
        }

        const contextData: any = {
          message: sessionData?.character
            ? `Greetings ${sessionData.character.name}, do you wish to continue your adventure?`
            : "You plunge through a shimmering membrane. Sapphire, amber, and emerald flare around you in a wild dance of light. The barrier parts at the edges of your vision with a soft ripple. Tendrils of liquid metal peel from your form and roll like quicksilver back into the pool’s restless mirrored surface. Before you drifts a formless gossamer being, its voice echoing, Greetings Human. What is your name?",
          sessionId: id,
          ...sessionData
        };

        if (knowledgeBaseId) {
          console.log(`📚 Usando Knowledge Base ID: ${knowledgeBaseId}`);
          contextData.knowledgeBaseId = knowledgeBaseId;
        }

        console.log("Enviando contextData a Vapi:", contextData);

        await vapiRef.current.start(assistantId, {
          context: JSON.stringify(contextData),
          firstMessage: contextData.message
        });
      }
    } catch (err) {
      console.error("❌ Error en toggleCall:", err);
    }
  };

  useEffect(() => {
    const initSession = async () => {
      if (sessionInitialized.current) return;
      sessionInitialized.current = true;

      let id = await fetchUserSessions();
      if (!id) {
        console.log("❌ No session found, creating a new one...");
        id = await createSession();
        if (!id) return;
      }

      setSessionId(id);
      sessionIdRef.current = id;
      await fetchSessionData(id);
    };

    initSession();
    initializeVapi();
  }, []);

  return { sessionId, volumeLevel, isSessionActive, conversation, toggleCall };
};

export default useVapi;