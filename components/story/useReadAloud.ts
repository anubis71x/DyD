"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveFile } from "@/lib/save/schema";
import type { TableEvent } from "@/lib/storyteller/events";
import { BrowserSpeaker, browserSpeechSupported } from "@/lib/voice/browserSpeech";
import { resolveVoice } from "@/lib/voice/routing";
import { UtteranceSegmenter } from "@/lib/voice/segmenter";

const STORAGE_KEY = "dreampool.readAloud";

/**
 * The audio half of play: reads the storyteller's replies aloud with the
 * device's voices while the real voice pipeline is paused. On by default;
 * the player can mute it (remembered per device). Feed it streamed table events via `onEvent`;
 * call `stop()` when the player acts (they've moved on).
 */
export function useReadAloud() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const enabledRef = useRef(false);
  const saveRef = useRef<SaveFile | undefined>(undefined);
  const segRef = useRef(new UtteranceSegmenter());
  const speakerRef = useRef<BrowserSpeaker | null>(null);

  useEffect(() => {
    if (!browserSpeechSupported()) return;
    setSupported(true);
    speakerRef.current = new BrowserSpeaker({ lang: "en", onSpeaking: setSpeaking });
    // Some browsers load their voice list asynchronously.
    window.speechSynthesis.getVoices();
    // Play is voice and text together: audio is on unless the player muted it.
    let muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {}
    enabledRef.current = !muted;
    setEnabled(!muted);
    return () => window.speechSynthesis.cancel();
  }, []);

  const setSave = useCallback((save: SaveFile | undefined) => {
    saveRef.current = save;
    if (save) speakerRef.current?.setLanguage(save.preferences.language || "en");
  }, []);

  const stop = useCallback(() => {
    segRef.current = new UtteranceSegmenter();
    speakerRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (!next) stop();
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {}
  }, [stop]);

  const onEvent = useCallback((e: TableEvent) => {
    const speaker = speakerRef.current;
    const save = saveRef.current;
    if (!enabledRef.current || !speaker || !save) return;
    const say = (utts: ReturnType<UtteranceSegmenter["flush"]>) => {
      for (const u of utts) speaker.say(u.text, resolveVoice(u.speaker, save));
    };
    if (e.type === "speech") say(segRef.current.push(e.speaker, e.text, e.mood));
    else if (e.type === "speech.end") say(segRef.current.flush());
    else if (e.type === "state") saveRef.current = e.save; // newly cast voices take effect right away
  }, []);

  return { supported, enabled, speaking, toggle, stop, onEvent, setSave };
}
