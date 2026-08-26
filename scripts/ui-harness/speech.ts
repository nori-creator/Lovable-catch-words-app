import { audioCacheKey, markSpeechReady } from "@/lib/tts-store";

/**
 * 足場の中で「発音の支度が済んだ」ことにする。
 *
 * ## なぜ要るのか
 * 発音ボタンは**鳴らせるようになってから**出る(オーナー指示 2026-08-26)。
 * 足場にはサーバが無いので、何もしないと**ボタンが1つも撮られない** —
 * 指の大きさの検査も、暗いテーマでの見え方も、丸ごと機械の目から消える。
 * この作業場は「場面が無い部品は測られない」で何度も落ちている。
 *
 * 本物の入れ物(`tts-store.ts`)に空の音を入れるだけ。判定の道は本物の
 * まま通るので、**出す/出さないの理屈自体を迂回していない**。
 */
export function readySpeech(words: readonly string[], language = "zh-TW"): void {
  for (const w of words) {
    const word = (w ?? "").trim();
    if (!word) continue;
    markSpeechReady(audioCacheKey(language, word), new Blob([], { type: "audio/mpeg" }));
  }
}
