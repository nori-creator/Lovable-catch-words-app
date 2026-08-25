import { useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeSpeech } from "@/lib/tts.functions";
import { speak } from "@/lib/speak";
import { claimAudio, primeAudio } from "@/lib/audio";
import { DEFAULT_TARGET_LANGUAGE } from "@/lib/target-lang";

/**
 * Accuracy-first pronunciation.
 *
 * Plays the server-synthesized native Taiwan-Mandarin audio (Google Cloud TTS
 * cmn-TW when configured) — one consistent, accurate voice on every device,
 * cached per session and served from storage after the first synth. Falls back
 * to the on-device voice only when server TTS isn't available (offline / not
 * configured), so pronunciation always works but prefers the accurate source.
 */
export type Pronounce = ((text: string) => Promise<void>) & {
  /**
   * 音声URLだけ先に取っておく(鳴らさない)。
   * 合成はサーバーと往復するので、演出の「空中のタメ」で鳴らしたいときは
   * 間に合わないことがある。見せ場に入る前にこれを呼んでおけば、その瞬間に
   * 待たずに鳴る。
   */
  prefetch: (text: string) => void;
};

/**
 * @param language 読む語の学習言語。**渡さないと台湾華語として読む。**
 *   英語の語をそのまま渡すと、サーバは台湾華語の声で合成し、
 *   端末の控えも台湾華語の声を探す。しかも合成した音は保存されるので、
 *   **誰かが聞くまで間違いに気づけない**。
 */
export function usePronounce(language: string = DEFAULT_TARGET_LANGUAGE): Pronounce {
  const ttsFn = useServerFn(synthesizeSpeech);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<Map<string, string>>(new Map());

  const pronounce = async function pronounce(text: string) {
    const word = text.trim();
    if (!word) return;
    // iOS: 再生解禁はタップ内で同期的に行う必要がある(await より前)。
    if (!elRef.current) elRef.current = new Audio();
    primeAudio(elRef.current);
    try {
      // **鍵に言語を混ぜる。** 同じ綴りが両方の言語に在り得る
      // ("a" / "in")。混ぜないと、先に鳴らしたほうの声が残る。
      const key = `${language}:${word}`;
      let url = cache.current.get(key);
      if (!url) {
        const r = await ttsFn({ data: { text: word, language } });
        if (r.audio_url) {
          url = r.audio_url;
          cache.current.set(key, url);
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
    speak(word, language);
  } as Pronounce;

  pronounce.prefetch = (text: string) => {
    const word = text.trim();
    if (!word || cache.current.has(`${language}:${word}`)) return;
    void ttsFn({ data: { text: word, language } })
      .then((r) => {
        if (r.audio_url) cache.current.set(`${language}:${word}`, r.audio_url);
      })
      .catch(() => {
        /* 先読みは best-effort。失敗しても本番の再生で取り直す */
      });
  };

  return pronounce;
}
