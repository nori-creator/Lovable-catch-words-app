/**
 * Free, on-device Taiwan-Mandarin pronunciation via the browser's Web Speech
 * API — no server, no external gateway, no cost. Apple devices ship a genuinely
 * native Taiwan voice (美佳 / Meijia); we prefer any zh-TW / Traditional voice
 * and fall back to a generic Chinese voice, then to the platform default.
 *
 * (Higher-fidelity neural Taiwan voices — e.g. Google Cloud TTS cmn-TW — can be
 * layered on later behind a server function; this keeps the app fully working
 * offline-ish and for free in the meantime.)
 */

let cached: SpeechSynthesisVoice | null = null;

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  // 1) explicit Taiwan / Traditional Chinese; 2) any Mandarin/Chinese voice.
  return (
    voices.find((v) => /zh[-_]?TW|zh[-_]?Hant|cmn[-_]?Hant|cmn[-_]?TW/i.test(v.lang)) ??
    voices.find((v) => /(^|[-_])(Meijia|美佳)/i.test(v.name)) ??
    voices.find((v) => /^zh|^cmn|Chinese/i.test(v.lang) || /Chinese|Mandarin|中文|國語|普通话/i.test(v.name)) ??
    null
  );
}

/** Speak a Taiwan-Mandarin string with the best available on-device voice. */
export function speakZhTW(text: string, rate = 0.95): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  const utter = () => {
    const voice = cached ?? pickVoice(synth);
    if (voice) cached = voice;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "zh-TW";
    u.rate = rate;
    synth.cancel();
    synth.speak(u);
  };

  // Voices can load asynchronously on the very first call.
  if (synth.getVoices().length === 0) {
    synth.addEventListener("voiceschanged", utter, { once: true });
    setTimeout(utter, 300); // safety net if the event already fired
  } else {
    utter();
  }
}

/** True when the browser can speak at all (used to hide dead pronunciation UI). */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
