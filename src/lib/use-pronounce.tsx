import { useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { speakZhTW } from "@/lib/speak";
import { claimAudio, primeAudio } from "@/lib/audio";

/**
 * Accuracy-first pronunciation.
 *
 * Plays the server-synthesized native Taiwan-Mandarin audio (Google Cloud TTS
 * cmn-TW when configured) — one consistent, accurate voice on every device,
 * cached per session and served from storage after the first synth. Falls back
 * to the on-device voice only when server TTS isn't available (offline / not
 * configured), so pronunciation always works but prefers the accurate source.
 */
export function usePronounce(): (text: string) => Promise<void> {
  const ttsFn = useServerFn(synthesizeSpeech);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Map<string, string>>(new Map());

  return async function pronounce(text: string) {
    const word = text.trim();
    if (!word) return;
    // iOS: 再生解禁はタップ内で同期的に行う必要がある(await より前)。
    if (!elRef.current) elRef.current = new Audio();
    primeAudio(elRef.current);
    try {
      let url = cache.current.get(word);
      if (!url) {
        const r = await ttsFn({ data: { text: word } });
        if (r.audio_url) {
          url = r.audio_url;
          cache.current.set(word, url);
        }
      }
      if (url) {
        // 音声の被り対策: このフックは画面ごとに別インスタンスなので、各自が
        // 自前の Audio を持つと重なって鳴る。再生前にグローバルで排他を取る。
        claimAudio(elRef.current);
        elRef.current.src = url;
        await elRef.current.play();
        return;
      }
    } catch {
      /* server TTS unavailable — use the device voice below */
    }
    speakZhTW(word);
  };
}
