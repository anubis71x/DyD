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
        } else {
          sessionIdRef.current = id;
        }

        // Separate the firstMessage from context data
        const firstMessage = sessionData?.character
          ? `Greetings ${sessionData.character.name}, do you wish to continue your adventure?`
          : "You plunge through a shimmering membrane. Sapphire, amber, and emerald flare around you in a wild dance of light. The barrier parts at the edges of your vision with a soft ripple. Tendrils of liquid metal peel from your form and roll like quicksilver back into the pool's restless mirrored surface. Before you drifts a formless gossamer being, its voice echoing, Greetings Human. What is your name?";

        // Context data without the message
        const contextData: any = {
          sessionId: id,
          ...sessionData
        };

        if (knowledgeBaseId) {
          console.log(`📚 Usando Knowledge Base ID: ${knowledgeBaseId}`);
          contextData.knowledgeBaseId = knowledgeBaseId;
        }

        console.log("Enviando contextData a Vapi:", contextData);
        console.log("Enviando firstMessage a Vapi:", firstMessage);

        await vapiRef.current.start(assistantId, {
          context: JSON.stringify(contextData),
          firstMessage: firstMessage
        });
      }
    } catch (err) {
      console.error("❌ Error en toggleCall:", err);
    }
  };