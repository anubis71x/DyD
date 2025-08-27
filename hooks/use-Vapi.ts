import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Vapi from "@vapi-ai/web";

const useVapi = (assistantId: string) => {
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

  useEffect(() => {
    if (sessionId) {
      sessionIdRef.current = sessionId;
      console.log("🔄 sessionIdRef updated:", sessionIdRef.current);
    }
  }, [sessionId]);

  const fetchUserSessions = async () => {
    try {
      const response = await fetch(`/api/sessions`, { method: "GET" });
      const data = await response.json();

      if (data.length > 0) {
        console.log("✅ User session found:", data[0]._id);
        setKnowledgeBaseId(data[0].knowledgeBaseId || null);
        return data[0]._id;
      }
      return null;
    } catch (error) {
      console.error("Error fetching user sessions:", error);
      return null;
    }
  };

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
      setKnowledgeBaseId(data.knowledgeBaseId || null);

      return data.sessionId ?? null;
    } catch (error) {
      console.error("Error creating session:", error);
      return null;
    }
  };

  const fetchSessionData = async (id: string) => {
    try {
      const response = await fetch(`/api/sessionData?sessionId=${id}`);
      const data = await response.json();
      console.log("✅ Fetched session data:", data);
      setSessionData(data);
      setKnowledgeBaseId(data.session?.knowledgeBaseId || null);
    } catch (error) {
      console.error("Error fetching session data:", error);
      setSessionData(null);
    }
  };

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
        console.log("🔄 Refreshing sessionData at call end...");

        if (sessionIdRef.current) {
          await fetchSessionData(sessionIdRef.current);
        } else {
          console.log("⚠ sessionId not available in sessionIdRef, unable to update sessionData.");
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
        } else {
          sessionIdRef.current = id;
        }

        const firstMessage = sessionData?.character
          ? `You pass through the shimmering dreampool with a soft ripple. A gossamer being floats before you. Greetings ${sessionData.character.name}, do you wish to continue your adventure?`
          : "You step through a glowing portal, colors flashing around you. The barrier ripples and parts. A shimmering figure appears, its voice soft. Greetings, traveler. This is a world between worlds. What is your name, and what path do you choose?";

        const contextData: any = {
          sessionId: id,
          ...sessionData
        };

        if ("message" in contextData) {
          delete contextData.message;
        }

        if (knowledgeBaseId) {
          console.log(`📚 Using Knowledge Base ID: ${knowledgeBaseId}`);
          contextData.knowledgeBaseId = knowledgeBaseId;
        }

        console.log("✅ Starting with contextData:", contextData);
        console.log("🗣️ First message:", firstMessage);

        await vapiRef.current.start(assistantId, {
          context: JSON.stringify(contextData),
          firstMessage
        });
      }
    } catch (err) {
      console.error("❌ Error in toggleCall:", err);
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
