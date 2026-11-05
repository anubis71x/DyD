"use client";

import type { ResolvedVoice } from "./routing";

/**
 * Read-aloud with the device's built-in voices (Web Speech API). A stand-in
 * while the real voice pipeline is paused: lower quality, but free and
 * instant. Each library voice maps to a stable system voice plus a pitch and
 * speed derived from its tags, so characters sound distinct.
 */

export interface SpeechProfile {
  pitch: number; // 0..2, 1 = normal
  rate: number; // 0.1..10, 1 = normal
  /** Prefer a system voice that sounds like this, when the device says. */
  gender?: "male" | "female";
}

const has = (tags: string[], ...words: string[]) => words.some((w) => tags.includes(w));
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Pitch/speed/gender for a voice, from its descriptive tags. Pure, for tests. */
export function speechProfile(tags: string[]): SpeechProfile {
  let pitch = 1;
  let rate = 1;
  if (has(tags, "deep", "booming", "giant", "ogre", "dragon", "huge", "low")) pitch -= 0.3;
  if (has(tags, "gruff", "rough")) pitch -= 0.1;
  if (has(tags, "child", "tiny", "fey", "fairy", "high", "sprite")) pitch += 0.45;
  if (has(tags, "young", "bright")) pitch += 0.1;
  if (has(tags, "older", "ancient", "old")) rate -= 0.08;
  if (has(tags, "slow", "ancient")) rate -= 0.12;
  if (has(tags, "energetic", "nervous", "cheerful", "playful", "fast")) rate += 0.1;
  if (has(tags, "whisper", "creepy", "ghost", "undead")) rate -= 0.05;
  const gender = has(tags, "female") ? "female" : has(tags, "male") ? "male" : undefined;
  return { pitch: clamp(pitch, 0.4, 1.8), rate: clamp(rate, 0.7, 1.3), ...(gender ? { gender } : {}) };
}

const FEMALE_HINTS = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava|kathy|monica|paulina|kyoko|google .*(uk english female|español)/i;
const MALE_HINTS = /male|man\b|daniel|alex|fred|david|mark|george|thomas|diego|jorge|otoya|rishi|aaron|arthur|google uk english male/i;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Choose a stable system voice for a library voice id, preferring the language and gender. */
export function pickSystemVoice(voices: SpeechSynthesisVoice[], voiceId: string, lang: string, gender?: "male" | "female") {
  const base = lang.slice(0, 2).toLowerCase();
  let pool = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  if (!pool.length) pool = voices;
  if (gender) {
    const hint = gender === "female" ? FEMALE_HINTS : MALE_HINTS;
    const matching = pool.filter((v) => hint.test(v.name) && !(gender === "male" && FEMALE_HINTS.test(v.name)));
    if (matching.length) pool = matching;
  }
  return pool.length ? pool[hash(voiceId) % pool.length] : undefined;
}

export const browserSpeechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Plays utterances in order. `stop()` cuts speech off immediately (e.g. the player starts a new turn). */
export class BrowserSpeaker {
  private lang: string;
  private onSpeaking?: (speaking: boolean) => void;

  constructor(opts: { lang: string; onSpeaking?: (speaking: boolean) => void }) {
    this.lang = opts.lang;
    this.onSpeaking = opts.onSpeaking;
  }

  setLanguage(lang: string) {
    this.lang = lang;
  }

  say(text: string, voice: ResolvedVoice) {
    if (!browserSpeechSupported() || !text.trim()) return;
    const profile = speechProfile(voice.tags);
    const u = new SpeechSynthesisUtterance(text);
    const system = pickSystemVoice(window.speechSynthesis.getVoices(), voice.voiceId, this.lang, profile.gender);
    try {
      if (system) u.voice = system;
    } catch {
      // Some browsers reject voices they listed; fall back to the default voice for the language.
    }
    u.lang = system?.lang ?? this.lang;
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    u.onstart = () => this.onSpeaking?.(true);
    u.onend = u.onerror = () => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) this.onSpeaking?.(false);
    };
    window.speechSynthesis.speak(u);
  }

  stop() {
    if (!browserSpeechSupported()) return;
    window.speechSynthesis.cancel();
    this.onSpeaking?.(false);
  }
}
