/**
 * 端末に載っている音声で台湾華語を読む — サーバの合成が使えないときの控え。
 *
 * ## なぜ「選び方」を厳密に決めるか(2026-08-19)
 * オーナー指摘:「音声の声がたまに異なる。様々な別のソフトの声がする。
 * 声質を統一したい。」原因は2つあった。
 *
 * 1. **復習の画面が自前の写しを持っていた。** そちらの条件は `/^zh/` で、
 *    大陸の普通話の声にそのまま当たる。覚えるための声が回ごとに変わり、
 *    しかも台湾華語ではない発音で読み上げられていた。
 * 2. **選び直しが毎回起きていた。** 端末の音声一覧は非同期に増える。
 *    早い段階の**途中の一覧**から選ぶと、次の機会には別の声が最良になる。
 *
 * だから「どれを選ぶか」を**点数で決めきる純粋な関数**にして、
 * 同じ一覧なら必ず同じ声が出るようにする(同点は名前順で割る)。
 * 発音の正しさはこのアプリの致命傷にあたる所なので、
 * **台湾の声が無いときに大陸の声で埋めない** — 声を当てずに
 * `lang` だけ渡し、端末に決めさせる。
 */

import { stopOtherAudio } from "@/lib/audio";

/** 判定に必要な所だけ。試験から素の物を渡せるようにしておく。 */
export type VoiceLike = { name: string; lang: string };

const TAIWAN_LANG = /zh[-_]?TW|zh[-_]?Hant|cmn[-_]?Hant|cmn[-_]?TW/i;
const TAIWAN_NAME = /Meijia|美佳|台灣|台湾|Taiwan/i;
/** 香港・マカオの繁体字。台湾ではないが、少なくとも繁体字圏の声。 */
const HANT_ELSEWHERE = /zh[-_]?(HK|MO)|yue/i;

/**
 * 声に点数を付ける。**大きいほど良い。0 以下は使わない。**
 * 大陸の普通話(zh-CN / zh-Hans)には点を与えない — 台湾華語とは
 * 声調も語彙も違うので、「無いよりまし」にならない。
 */
export function voiceScore(v: VoiceLike): number {
  const lang = v.lang ?? "";
  const name = v.name ?? "";
  if (TAIWAN_LANG.test(lang)) return TAIWAN_NAME.test(name) ? 100 : 90;
  // lang が曖昧でも、名前で台湾の声だと分かるものがある(古い端末)。
  if (TAIWAN_NAME.test(name)) return 80;
  if (HANT_ELSEWHERE.test(lang)) return 40;
  return 0;
}

/**
 * 一覧から1つ選ぶ。**同じ一覧なら必ず同じ声**を返す(同点は名前順)。
 * 使える声が無ければ null。
 */
export function pickZhTWVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const score = voiceScore(v);
    if (score <= 0) continue;
    if (
      score > bestScore ||
      (score === bestScore && best !== null && (v.name ?? "") < (best.name ?? ""))
    ) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 選んだ声の覚え書き。
 * **途中の一覧から選んだものは覚えない** — 覚えてしまうと、その回だけ
 * 出来の悪い選択がその後ずっと続く。
 */
let cached: SpeechSynthesisVoice | null = null;

/** 台湾華語の文字列を、端末で一番ましな声で読む。 */
export function speakZhTW(text: string, rate = 0.95): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;

  // 初回は `voiceschanged` と下の保険の両方が走りうるので、1度だけ話す。
  let spoke = false;
  const utter = () => {
    if (spoke) return;
    spoke = true;
    const voices = synth.getVoices();
    const voice = cached ?? pickZhTWVoice(voices);
    // 一覧が空のうちに選んだ結果は覚えない(次に増えたら選び直す)。
    if (voice && voices.length > 0) cached = voice;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    // 声を当てられないときも**台湾華語だと伝える**。
    // 大陸の声で埋めるより、端末に決めさせるほうが害が小さい。
    u.lang = voice?.lang ?? "zh-TW";
    u.rate = rate;
    // 音声の被り対策: 直前に鳴っている <audio>(サーバーTTS)も止めてから話す。
    // synth.cancel() だけでは Audio 要素は止まらず、二重に聞こえていた。
    stopOtherAudio();
    synth.speak(u);
  };

  // 端末の音声一覧は非同期に届く。
  if (synth.getVoices().length === 0) {
    synth.addEventListener("voiceschanged", utter, { once: true });
    setTimeout(utter, 300); // 事象が先に流れていたときの保険
  } else {
    utter();
  }
}

/** ブラウザがそもそも喋れるか(喋れない端末で死んだUIを出さないため)。 */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
